import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { cpus, totalmem } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import argon2 from "argon2";
import postgres from "postgres";
import { inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema.js";
import {
  businessAudit,
  contacts,
  directoryReceipts,
  engagements,
  loginBuckets,
  projectBudgets,
  projects,
  refreshTokens,
  sessions,
  syncChanges,
  users,
} from "../src/db/schema.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const origin = process.env.AUTH_ALLOWED_ORIGIN;
const sampleCount = 200;
const warmupCount = 10;
const password = randomBytes(32).toString("base64url");
const admins = Array.from({ length: 5 }, (_, index) => ({
  id: randomUUID(),
  username: `m1b-perf-${index}-${randomUUID().slice(0, 8)}`,
  displayName: `Synthetic performance admin ${index + 1}`,
}));
const client = process.env.DATABASE_URL
  ? postgres(process.env.DATABASE_URL, { max: 1 })
  : undefined;
const db = client ? drizzle(client, { schema }) : undefined;
const reportPath = resolve(root, "output/perf/m1b-api-performance.json");
const requestSizes = new WeakMap<Response, number>();

type Sample = { elapsedMs: number; requestBytes: number; responseBytes: number };
type ApiClient = {
  csrf: string;
  refresh: string | undefined;
  access: string;
  request(path: string, init?: RequestInit): Promise<Response>;
};

async function main() {
  if (process.env.APP_ENV !== "local") throw new Error("Performance verification is local-only.");
  if (!db || !client || !origin)
    throw new Error("DATABASE_URL and AUTH_ALLOWED_ORIGIN are required.");
  let server: ChildProcess | undefined;
  try {
    await createAccounts();
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    let childOutput = "";
    server = spawn(process.execPath, ["--env-file-if-exists=../../.env", "dist/main.js"], {
      cwd: resolve(root, "apps/api"),
      env: { ...process.env, API_PORT: String(port), AUTH_ALLOWED_ORIGIN: origin },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.setEncoding("utf8");
    server.stderr?.setEncoding("utf8");
    server.stdout?.on("data", (chunk: string) => (childOutput += chunk));
    server.stderr?.on("data", (chunk: string) => (childOutput += chunk));
    await waitReady(base, server, () => childOutput);

    const clients = await Promise.all(admins.map((admin) => signIn(base, admin)));
    const fixture = await seedFixture(clients[0]!);
    const measurements: Record<string, ReturnType<typeof summarize>> = {};

    measurements.projects_list = await measure(clients, sampleCount, warmupCount, async (api) => {
      return api.request("/api/v1/projects?limit=200");
    });
    measurements.contacts_list = await measure(clients, sampleCount, warmupCount, async (api) => {
      return api.request("/api/v1/contacts?role=worker&limit=200");
    });
    measurements.engagements_list = await measure(clients, sampleCount, warmupCount, async (api) =>
      api.request("/api/v1/engagements?limit=200"),
    );
    measurements.budgets_list = await measure(clients, sampleCount, warmupCount, async (api) => {
      return api.request(`/api/v1/projects/${fixture.activeProjects[0]}/budgets?limit=200`);
    });
    measurements.projects_write = await measure(clients, sampleCount, 0, async (api, index) => {
      return jsonRequest(api, "/api/v1/projects", "POST", {
        name: `Synthetic benchmark project ${String(index).padStart(3, "0")}`,
        ownerContactId: null,
        startsOn: null,
        endsOn: null,
        contractInitialToman: String(10_000_000 + index * 1_000),
      });
    });
    measurements.contacts_write = await measure(clients, sampleCount, 0, async (api, index) => {
      return jsonRequest(api, "/api/v1/contacts", "POST", {
        displayName: `Synthetic benchmark worker ${String(index).padStart(3, "0")}`,
        phone: null,
        isWorker: true,
        isSupplier: false,
        isOwner: false,
      });
    });
    measurements.engagements_write = await measure(clients, sampleCount, 0, async (api, index) => {
      const [workerId, projectId] = fixture.benchmarkPairs[index]!;
      return jsonRequest(api, "/api/v1/engagements", "POST", {
        workerId,
        projectId,
        type: "DAILY",
        defaultRateToman: String(400_000 + index),
        startsOn: `2027-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
        endsOn: null,
      });
    });
    measurements.budgets_write = await measure(clients, sampleCount, 0, async (api, index) => {
      return jsonRequest(
        api,
        `/api/v1/projects/${fixture.activeProjects[index % 10]}/budgets`,
        "PUT",
        [
          {
            id: randomUUID(),
            category: `Synthetic benchmark label ${String(index).padStart(3, "0")}`,
            amountToman: String(2_000_000 + index * 5_000),
            expectedVersion: 0,
          },
        ],
      );
    });
    measurements.sync_command_ack = await measure(
      clients,
      sampleCount,
      warmupCount,
      async (api, index) => {
        const entityId = randomUUID();
        return jsonRequest(api, "/api/v1/sync/commands", "POST", [
          {
            commandId: randomUUID(),
            entityId,
            expectedVersion: 0,
            kind: "CONTACT_CREATE",
            payload: {
              displayName: `Synthetic sync worker ${String(index).padStart(3, "0")}`,
              phone: null,
              isWorker: true,
              isSupplier: false,
              isOwner: false,
            },
          },
        ]);
      },
    );
    measurements.auth_me = await measure(clients, sampleCount, warmupCount, async (api) => {
      return api.request("/api/v1/auth/me");
    });

    const report = {
      measuredAt: new Date().toISOString(),
      baseRevision: execFileSync(
        "git",
        ["-c", "safe.directory=F:/codes/sazeh", "rev-parse", "HEAD"],
        {
          cwd: root,
          encoding: "utf8",
        },
      ).trim(),
      sourceState: "implementation working tree",
      platform: `${process.platform} ${process.arch}`,
      node: process.version,
      cpu: cpus()[0]?.model ?? "unknown",
      logicalCpus: cpus().length,
      memoryGiB: Number((totalmem() / 1024 ** 3).toFixed(1)),
      sessions: clients.length,
      concurrency: clients.length,
      dataset: {
        activeProjects: fixture.activeProjects.length,
        archivedProjects: fixture.archivedProjects.length,
        owners: 10,
        workers: 100,
        suppliers: 30,
        engagements: fixture.engagementCount,
        budgetLines: fixture.budgetCount,
        projectsWithOwner: fixture.projectsWithOwner,
        multiRoleContacts: fixture.multiRoleContacts,
        timingWritesAdded: {
          projects: 200,
          contacts: 200,
          engagements: 200,
          budgets: 200,
          syncContacts: 210,
        },
      },
      method: {
        warmupsPerReadPath: warmupCount,
        samplesPerPath: sampleCount,
        sampleStyle:
          "five authenticated ADMIN sessions issue requests in concurrent batches; elapsed time includes response body read",
        writePaths:
          "each measured write creates one synthetic record/line so requests do not contend on one record version",
        network: "loopback HTTP; no external network latency",
      },
      results: measurements,
      target:
        "Each ordinary list/write path p95 below 1000 ms. Sync acknowledgement and auth/me are reported without a latency pass/fail threshold.",
    };
    await mkdir(dirname(reportPath), { recursive: true });
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`M1b API performance report written: ${reportPath}\n`);
    process.stdout.write(`${JSON.stringify(report.results, null, 2)}\n`);

    for (const [name, values] of Object.entries(measurements)) {
      if (name.endsWith("_list") || name.endsWith("_write")) {
        assert(values.p95Ms < 1_000, `${name} p95 ${values.p95Ms} ms must be below 1000 ms`);
      }
    }
  } finally {
    if (server) await stop(server);
    if (db) await cleanup();
    await client?.end({ timeout: 5 });
  }
}

async function createAccounts() {
  assert(db);
  await db.insert(users).values(
    await Promise.all(
      admins.map(async (admin) => ({
        ...admin,
        passwordHash: await argon2.hash(password, {
          type: argon2.argon2id,
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
        }),
        role: "ADMIN" as const,
        active: true,
        mustChangePassword: false,
        credentialVersion: 1,
      })),
    ),
  );
}

async function signIn(base: string, account: (typeof admins)[number]): Promise<ApiClient> {
  let refresh: string | undefined;
  const csrfResponse = await fetch(`${base}/api/v1/auth/csrf`, { headers: { origin: origin! } });
  assert(csrfResponse.ok, "CSRF token bootstraps");
  const csrf = ((await csrfResponse.json()) as { csrfToken: string }).csrfToken;
  const login = await fetch(`${base}/api/v1/auth/login`, {
    method: "POST",
    headers: {
      origin: origin!,
      cookie: `sazeh_csrf=${csrf}`,
      "x-csrf-token": csrf,
      "content-type": "application/json",
    },
    body: JSON.stringify({ username: account.username, password }),
  });
  assert.equal(login.status, 200, `synthetic admin login (${account.username})`);
  for (const cookie of getSetCookies(login)) {
    const match = /^sazeh_refresh=([^;]*)/.exec(cookie);
    if (match) refresh = match[1] || undefined;
  }
  const body = (await login.json()) as { accessToken: string };
  const api: ApiClient = {
    csrf,
    refresh,
    access: body.accessToken,
    async request(path, init = {}) {
      const headers = new Headers(init.headers);
      headers.set("origin", origin!);
      headers.set("authorization", `Bearer ${api.access}`);
      const cookies = [`sazeh_csrf=${api.csrf}`, api.refresh ? `sazeh_refresh=${api.refresh}` : ""]
        .filter(Boolean)
        .join("; ");
      if (cookies) headers.set("cookie", cookies);
      if (init.body !== undefined && !headers.has("content-type"))
        headers.set("content-type", "application/json");
      if (["POST", "PUT", "PATCH", "DELETE"].includes((init.method ?? "GET").toUpperCase()))
        headers.set("x-csrf-token", api.csrf);
      const response = await fetch(`${base}${path}`, { ...init, headers });
      for (const cookie of getSetCookies(response)) {
        const match = /^sazeh_refresh=([^;]*)/.exec(cookie);
        if (match) api.refresh = match[1] || undefined;
      }
      return response;
    },
  };
  return api;
}

async function seedFixture(api: ApiClient) {
  const ownerIds: string[] = [];
  const workerIds: string[] = [];
  const supplierIds: string[] = [];
  const activeProjects: string[] = [];
  const archivedProjects: string[] = [];
  let multiRoleContacts = 0;
  for (let index = 0; index < 10; index++) {
    const owner = await createContact(api, `کارفرمای نمونه ${index + 1}`, { owner: true });
    ownerIds.push(owner);
  }
  for (let index = 0; index < 100; index++) {
    const multiRole = index === 0;
    const worker = await createContact(api, `نیروی نمونه ${index + 1}`, {
      worker: true,
      supplier: multiRole,
    });
    workerIds.push(worker);
    if (multiRole) multiRoleContacts++;
  }
  for (let index = 0; index < 30; index++) {
    supplierIds.push(
      await createContact(api, `تامین‌کننده نمونه ${index + 1}`, { supplier: true }),
    );
  }
  for (let index = 0; index < 12; index++) {
    const response = await api.request("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({
        name: `پروژه نمونه ${String(index + 1).padStart(2, "0")}`,
        ownerContactId: ownerIds[index % ownerIds.length],
        startsOn: `2026-0${(index % 9) + 1}-01`,
        endsOn: `2027-0${(index % 9) + 1}-28`,
        contractInitialToman: String(80_000_000 + index * 7_500_000),
      }),
    });
    assert.equal(response.status, 201, "synthetic project is created through the API");
    const project = (await response.json()) as { id: string };
    if (index < 10) activeProjects.push(project.id);
    else {
      const archived = await api.request(`/api/v1/projects/${project.id}/lifecycle`, {
        method: "POST",
        body: JSON.stringify({
          expectedVersion: 1,
          action: "ARCHIVE",
          reason: "Synthetic demo history",
        }),
      });
      assert.equal(archived.status, 201);
      archivedProjects.push(project.id);
    }
  }

  let engagementCount = 0;
  const usedPairs = new Set<string>();
  for (let worker = 0; worker < workerIds.length; worker++) {
    for (const projectIndex of [worker % 10, (worker + 1) % 10]) {
      const projectId = activeProjects[projectIndex]!;
      usedPairs.add(`${workerIds[worker]}:${projectId}`);
      const response = await api.request("/api/v1/engagements", {
        method: "POST",
        body: JSON.stringify({
          workerId: workerIds[worker],
          projectId,
          type: worker % 2 ? "DAILY" : "HOURLY",
          defaultRateToman: String(350_000 + worker * 3_000),
          startsOn: "2026-01-01",
          endsOn: null,
        }),
      });
      assert.equal(response.status, 201, "synthetic engagement is created");
      engagementCount++;
    }
  }
  const benchmarkPairs: Array<[string, string]> = [];
  for (const workerId of workerIds) {
    for (const projectId of activeProjects) {
      if (usedPairs.has(`${workerId}:${projectId}`)) continue;
      benchmarkPairs.push([workerId, projectId]);
      if (benchmarkPairs.length === sampleCount) break;
    }
    if (benchmarkPairs.length === sampleCount) break;
  }
  assert.equal(benchmarkPairs.length, sampleCount, "benchmark has 200 unused worker/project pairs");

  let budgetCount = 0;
  for (const projectId of activeProjects) {
    const response = await api.request(`/api/v1/projects/${projectId}/budgets`, {
      method: "PUT",
      body: JSON.stringify([
        { id: randomUUID(), category: "نیروی کار", amountToman: "18000000", expectedVersion: 0 },
        {
          id: randomUUID(),
          category: "پشتیبانی کارگاه",
          amountToman: "4200000",
          expectedVersion: 0,
        },
      ]),
    });
    assert.equal(response.status, 200, "synthetic project budgets are created");
    budgetCount += 2;
  }
  return {
    activeProjects,
    archivedProjects,
    benchmarkPairs,
    engagementCount,
    budgetCount,
    projectsWithOwner: activeProjects.length,
    multiRoleContacts,
  };
}

async function createContact(
  api: ApiClient,
  displayName: string,
  roles: { worker?: boolean; supplier?: boolean; owner?: boolean },
) {
  const response = await api.request("/api/v1/contacts", {
    method: "POST",
    body: JSON.stringify({
      displayName,
      phone: null,
      isWorker: roles.worker ?? false,
      isSupplier: roles.supplier ?? false,
      isOwner: roles.owner ?? false,
    }),
  });
  assert.equal(response.status, 201, "synthetic contact is created through the API");
  return ((await response.json()) as { id: string }).id;
}

async function measure(
  clients: ApiClient[],
  count: number,
  warmups: number,
  run: (api: ApiClient, index: number) => Promise<Response>,
) {
  for (let index = 0; index < warmups; index++) {
    const response = await run(clients[index % clients.length]!, index);
    assert(response.ok, `warmup request succeeded (status ${response.status})`);
    await response.arrayBuffer();
  }
  const samples: Sample[] = [];
  for (let offset = 0; offset < count; offset += clients.length) {
    const batch = clients.map(async (api, lane) => {
      const index = offset + lane;
      if (index >= count) return;
      const started = performance.now();
      const response = await run(api, index);
      const bytes = await response.arrayBuffer();
      const elapsedMs = performance.now() - started;
      assert(response.ok, `measured request succeeded (status ${response.status})`);
      if (response.status === 201 && response.headers.get("content-type")?.includes("json")) {
        const result = JSON.parse(Buffer.from(bytes).toString("utf8")) as unknown;
        assert(result !== undefined, "write response has a JSON body");
      }
      samples.push({
        elapsedMs,
        requestBytes: requestSizes.get(response) ?? 0,
        responseBytes: bytes.byteLength,
      });
    });
    await Promise.all(batch);
  }
  return summarize(samples);
}

async function jsonRequest(api: ApiClient, path: string, method: string, body: unknown) {
  const serialized = JSON.stringify(body);
  const response = await api.request(path, { method, body: serialized });
  requestSizes.set(response, Buffer.byteLength(serialized));
  return response;
}

function summarize(samples: Sample[]) {
  const sorted = samples.map((sample) => sample.elapsedMs).sort((a, b) => a - b);
  const percentile = (ratio: number) =>
    Number(sorted[Math.ceil(sorted.length * ratio) - 1]!.toFixed(2));
  return {
    samples: samples.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: Number(Math.max(...sorted).toFixed(2)),
    averageRequestBytes: Math.round(
      samples.reduce((sum, sample) => sum + sample.requestBytes, 0) / samples.length,
    ),
    averageResponseBytes: Math.round(
      samples.reduce((sum, sample) => sum + sample.responseBytes, 0) / samples.length,
    ),
  };
}

async function cleanup() {
  assert(db && client);
  const ids = admins.map((admin) => admin.id);
  await db.transaction(async (tx) => {
    await tx.delete(businessAudit).where(inArray(businessAudit.actorUserId, ids));
    await tx.delete(syncChanges).where(inArray(syncChanges.actorUserId, ids));
    await tx.delete(directoryReceipts).where(inArray(directoryReceipts.userId, ids));
    await tx.delete(engagements).where(inArray(engagements.createdBy, ids));
    await tx.delete(projectBudgets).where(inArray(projectBudgets.updatedBy, ids));
    await tx.delete(projects).where(inArray(projects.createdBy, ids));
    await tx.delete(contacts).where(inArray(contacts.createdBy, ids));
    const fixtureSessions = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(inArray(sessions.userId, ids));
    const sessionIds = fixtureSessions.map(({ id }) => id);
    if (sessionIds.length) {
      await tx.delete(businessAudit).where(inArray(businessAudit.actorSessionId, sessionIds));
      await tx.delete(refreshTokens).where(inArray(refreshTokens.sessionId, sessionIds));
      await tx.delete(sessions).where(inArray(sessions.id, sessionIds));
    }
    const usernameHashes = admins.map((admin) =>
      createHash("sha256").update(`username:${admin.username}`).digest("hex"),
    );
    await tx.delete(loginBuckets).where(inArray(loginBuckets.key, usernameHashes));
    const removed = await tx
      .delete(users)
      .where(inArray(users.id, ids))
      .returning({ id: users.id });
    assert.equal(removed.length, ids.length, "synthetic performance users are removed");
  });
}

function getSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return (
    headers.getSetCookie?.() ??
    (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : [])
  );
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Unable to reserve an API port.");
  const port = address.port;
  await new Promise<void>((resolveClose, reject) =>
    server.close((error) => (error ? reject(error) : resolveClose())),
  );
  return port;
}

async function waitReady(base: string, child: ChildProcess, output: () => string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`API stopped during startup: ${output()}`);
    try {
      if ((await fetch(`${base}/api/health/ready`)).ok) return;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 200));
  }
  throw new Error(`API did not become ready: ${output()}`);
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  const exited = new Promise<void>((resolveExit) => child.once("exit", () => resolveExit()));
  child.kill("SIGTERM");
  await Promise.race([exited, new Promise((resolveWait) => setTimeout(resolveWait, 5_000))]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.exitCode = 1;
});
