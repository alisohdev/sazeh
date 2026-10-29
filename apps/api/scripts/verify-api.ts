import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { once } from "node:events";
import argon2 from "argon2";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray, isNull } from "drizzle-orm";
import * as schema from "../src/db/schema.js";
import {
  accountAudit,
  authenticatedReceipts,
  businessAudit,
  contacts,
  directoryReceipts,
  engagements,
  noteDrafts,
  projectBudgets,
  projects,
  refreshTokens,
  sessions,
  syncChanges,
  users,
} from "../src/db/schema.js";
import { ACCESS_SECONDS } from "../src/identity/tokens.js";

type LoginResult = {
  accessToken: string;
  expiresAt: number;
  user: { id: string; username: string; role: "SUPERUSER" | "ADMIN"; mustChangePassword: boolean };
  status?: number;
  errorCode?: string;
  errorMessage?: string;
};

async function main(): Promise<void> {
  if (process.env.APP_ENV !== "local") throw new Error("API verification requires APP_ENV=local");
  const databaseUrl = process.env.DATABASE_URL;
  const origin = process.env.AUTH_ALLOWED_ORIGIN;
  if (!databaseUrl || !origin) throw new Error("DATABASE_URL and AUTH_ALLOWED_ORIGIN are required");
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters");

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const fixturePassword = randomBytes(32).toString("base64url");
  const fixtureUsername = `m1averify-${randomUUID().slice(0, 8)}`;
  const fixtureId = randomUUID();
  const fixture: Array<{ id: string; username: string }> = [
    { id: fixtureId, username: fixtureUsername },
  ];
  const verificationDrafts: string[] = [];
  const client = postgres(databaseUrl, { max: 1 });
  await drizzle(client, { schema })
    .insert(users)
    .values({
      id: fixtureId,
      username: fixtureUsername,
      displayName: "M1a verification superuser",
      passwordHash: await argon2.hash(fixturePassword, {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      }),
      role: "SUPERUSER",
      active: true,
      mustChangePassword: false,
      credentialVersion: 1,
    });
  await client.end({ timeout: 5 });

  let server: ChildProcess | undefined;
  let childOutput = "";
  const start = async () => {
    server = spawn(process.execPath, ["--env-file=../../.env", "dist/main.js"], {
      cwd: process.cwd(),
      env: { ...process.env, APP_ENV: "local", API_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.setEncoding("utf8");
    server.stdout?.on("data", (chunk: string) => {
      childOutput += chunk;
    });
    server.stderr?.setEncoding("utf8");
    server.stderr?.on("data", (chunk: string) => {
      childOutput += chunk;
    });
    await waitReady(base, server, () => childOutput);
  };

  let verificationSucceeded = false;
  let cleanupInvariantFailed: boolean;
  try {
    await start();
    assert.equal(
      (await fetch(`${base}/api/health/live`)).status,
      200,
      "health liveness stays public",
    );
    assert.equal(
      (await fetch(`${base}/api/health/ready`)).status,
      200,
      "health readiness stays public",
    );

    const root = makeClient(base, origin);
    await root.bootstrapCsrf();
    const legacy = await legacyDraftId(databaseUrl);

    const commandA = draftCommand(randomUUID(), randomUUID(), "M1a authenticated draft A");
    verificationDrafts.push(commandA.entityId);
    assert.equal(
      (await fetch(`${base}/api/v1/drafts/${legacy}`)).status,
      401,
      "direct draft reads reject unauthenticated callers",
    );
    const anonymousPost = await root.request(
      "/api/v1/drafts",
      { method: "POST", body: JSON.stringify(commandA) },
      { authenticated: false },
    );
    assert.equal(
      anonymousPost.status,
      401,
      "local mode does not provide an anonymous draft bypass",
    );
    assert.equal(
      (await root.request("/api/v1/projects")).status,
      401,
      "directory reads require authentication",
    );
    assert.equal(
      (
        await root.request(
          "/api/v1/drafts",
          { method: "POST", body: JSON.stringify(commandA) },
          { origin: "https://attacker.example" },
        )
      ).status,
      403,
      "unsafe requests reject untrusted origins",
    );
    assert.equal(
      (
        await root.request(
          "/api/v1/drafts",
          { method: "POST", body: JSON.stringify(commandA) },
          { includeCsrfHeader: false },
        )
      ).status,
      403,
      "unsafe requests require a CSRF header bound to the cookie",
    );
    const noOrigin = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `sazeh_csrf=${root.csrf}` },
      body: JSON.stringify({ username: fixtureUsername, password: fixturePassword }),
    });
    assert.equal(noOrigin.status, 403, "credential endpoints reject requests without Origin");

    const superuserLogin = await root.login(fixtureUsername, fixturePassword);
    assert(
      superuserLogin.user,
      `superuser login failed (${(superuserLogin as unknown as { status?: number; errorCode?: string }).status ?? "no status"} ${(superuserLogin as unknown as { errorCode?: string; errorMessage?: string }).errorCode ?? "no code"}: ${(superuserLogin as unknown as { errorMessage?: string }).errorMessage ?? "no message"}); API output: ${childOutput.slice(-4000)}`,
    );
    assert.equal(superuserLogin.user.role, "SUPERUSER");
    assert(
      superuserLogin.expiresAt - Date.now() <= 15 * 60_000,
      "access tokens expire within 15 minutes",
    );
    const noAuthPost = await root.request(
      "/api/v1/drafts",
      { method: "POST", body: JSON.stringify(commandA) },
      { authenticated: false },
    );
    assert.equal(noAuthPost.status, 401, "valid origin and CSRF do not replace authentication");
    assert.equal(
      (await root.request(`/api/v1/drafts/${legacy}`)).status,
      404,
      "legacy M0 data remains unowned and is not exposed after login",
    );
    assert.equal((await root.request("/api/v1/admins")).status, 200, "superuser can list admins");

    const createdAResponse = await root.request("/api/v1/admins", {
      method: "POST",
      body: JSON.stringify({
        username: `admin-${randomUUID().slice(0, 8)}`,
        displayName: "M1a admin A",
      }),
    });
    assert.equal(createdAResponse.status, 201, "superuser creates an ordinary admin account");
    const createdA = (await createdAResponse.json()) as {
      admin: { id: string; username: string; mustChangePassword: boolean };
      temporaryPassword: string;
    };
    fixture.push({ id: createdA.admin.id, username: createdA.admin.username });
    assert.equal(
      createdA.admin.mustChangePassword,
      true,
      "new admin must change the temporary password",
    );
    assert(createdA.temporaryPassword.length >= 14, "server returns a one-time temporary password");

    const adminA = makeClient(base, origin);
    await adminA.bootstrapCsrf();
    const temporaryLogin = await adminA.login(createdA.admin.username, createdA.temporaryPassword);
    assert.equal(temporaryLogin.user.mustChangePassword, true);
    const restrictedMe = await adminA.request("/api/v1/auth/me");
    assert.equal(
      restrictedMe.status,
      403,
      "temporary-password session cannot access application routes",
    );
    assert.equal(
      (await adminA.request("/api/v1/projects")).status,
      403,
      "temporary-password sessions cannot access directory APIs",
    );
    assert.equal(
      (await adminA.request("/api/v1/drafts", { method: "POST", body: JSON.stringify(commandA) }))
        .status,
      403,
      "temporary-password session cannot write drafts",
    );
    const newPasswordA = randomBytes(32).toString("base64url");
    const firstPasswordChange = await adminA.request("/api/v1/auth/password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: createdA.temporaryPassword,
        newPassword: newPasswordA,
      }),
    });
    assert.equal(
      firstPasswordChange.status,
      204,
      "first login permits only the required password change",
    );
    assert.equal(
      (await adminA.request("/api/v1/auth/me")).status,
      401,
      "password change revokes the temporary session",
    );
    assert.equal(
      (await adminA.login(createdA.admin.username, createdA.temporaryPassword)).status,
      401,
      "old temporary password is rejected after change",
    );
    const normalA = await adminA.login(createdA.admin.username, newPasswordA);
    assert.equal(normalA.user.mustChangePassword, false);
    assert.equal(
      (await adminA.request("/api/v1/admins")).status,
      403,
      "ordinary admins cannot call account-management endpoints",
    );

    const legacyRead = await adminA.request(`/api/v1/drafts/${legacy}`);
    assert.equal(legacyRead.status, 404, "legacy data has no inferred owner");

    const ownerResponse = await adminA.request("/api/v1/contacts", {
      method: "POST",
      body: JSON.stringify({
        displayName: "M1b verification owner",
        phone: null,
        isWorker: false,
        isSupplier: false,
        isOwner: true,
        createdBy: fixtureId,
        createdBy: fixtureId,
      }),
    });
    assert.equal(
      ownerResponse.status,
      201,
      `authenticated admin creates a shared owner contact: ${await ownerResponse.clone().text()}`,
    );
    const owner = (await ownerResponse.json()) as { id: string; version: number };
    const workerResponse = await adminA.request("/api/v1/contacts", {
      method: "POST",
      body: JSON.stringify({
        displayName: "M1b verification worker",
        phone: null,
        isWorker: true,
        isSupplier: false,
        isOwner: false,
      }),
    });
    assert.equal(workerResponse.status, 201, "worker is a directory contact, not an account");
    const worker = (await workerResponse.json()) as { id: string; version: number };
    const projectResponse = await adminA.request("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({
        name: "M1b verification project",
        ownerContactId: owner.id,
        startsOn: "2026-10-01",
        endsOn: "2026-12-31",
        contractInitialToman: "120000000",
      }),
    });
    assert.equal(projectResponse.status, 201, "authenticated admin creates a shared project");
    const project = (await projectResponse.json()) as {
      id: string;
      version: number;
      lifecycle: string;
    };
    assert.equal(project.lifecycle, "ACTIVE");
    assert.equal(
      (
        await adminA.request(`/api/v1/projects/${project.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            expectedVersion: 0,
            name: "Stale",
            ownerContactId: owner.id,
            startsOn: "2026-10-01",
            endsOn: "2026-12-31",
            contractInitialToman: "120000000",
          }),
        })
      ).status,
      409,
      "stale project edits conflict",
    );
    const engagement = {
      workerId: worker.id,
      projectId: project.id,
      type: "DAILY",
      defaultRateToman: "2500000",
      startsOn: "2026-10-01",
      endsOn: "2026-10-31",
    };
    assert.equal(
      (
        await adminA.request("/api/v1/engagements", {
          method: "POST",
          body: JSON.stringify(engagement),
        })
      ).status,
      201,
      "worker can be assigned with a dated default rate",
    );
    assert.equal(
      (
        await adminA.request("/api/v1/engagements", {
          method: "POST",
          body: JSON.stringify({ ...engagement, startsOn: "2026-10-31", endsOn: "2026-11-15" }),
        })
      ).status,
      409,
      "inclusive engagement end dates reject overlap",
    );
    assert.equal(
      (
        await adminA.request("/api/v1/engagements", {
          method: "POST",
          body: JSON.stringify({
            ...engagement,
            startsOn: "2026-11-01",
            endsOn: null,
            type: "HOURLY",
          }),
        })
      ).status,
      201,
      "next-day period may be ongoing",
    );
    const additionalTypes = ["QUANTITY", "MONTHLY", "FIXED_CONTRACT", "MANUAL"] as const;
    for (const type of additionalTypes) {
      const response = await adminA.request("/api/v1/contacts", {
        method: "POST",
        body: JSON.stringify({
          displayName: `M1b ${type} worker`,
          phone: null,
          isWorker: true,
          isSupplier: false,
          isOwner: false,
        }),
      });
      assert.equal(response.status, 201, `${type} worker contact is created`);
      const typeWorker = (await response.json()) as { id: string };
      const typeResult = await adminA.request("/api/v1/engagements", {
        method: "POST",
        body: JSON.stringify({
          workerId: typeWorker.id,
          projectId: project.id,
          type,
          defaultRateToman: "750000",
          startsOn: "2026-10-01",
          endsOn: "2026-10-31",
        }),
      });
      assert.equal(typeResult.status, 201, `${type} engagement type is accepted`);
    }
    const concurrentWorkerResponse = await adminA.request("/api/v1/contacts", {
      method: "POST",
      body: JSON.stringify({
        displayName: "M1b concurrent worker",
        phone: null,
        isWorker: true,
        isSupplier: false,
        isOwner: false,
      }),
    });
    assert.equal(concurrentWorkerResponse.status, 201);
    const concurrentWorker = (await concurrentWorkerResponse.json()) as { id: string };
    const concurrentAssignments = await Promise.all(
      [
        { startsOn: "2026-11-01", endsOn: "2026-11-10" },
        { startsOn: "2026-11-10", endsOn: "2026-11-20" },
      ].map((dates) =>
        adminA.request("/api/v1/engagements", {
          method: "POST",
          body: JSON.stringify({
            ...engagement,
            workerId: concurrentWorker.id,
            ...dates,
          }),
        }),
      ),
    );
    assert.deepEqual(
      concurrentAssignments.map((response) => response.status).sort(),
      [201, 409],
      "concurrent same-day overlap is serialized and rejected",
    );
    const otherProjectResponse = await adminA.request("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({
        name: "M1b concurrent project",
        ownerContactId: owner.id,
        startsOn: null,
        endsOn: null,
        contractInitialToman: "0",
      }),
    });
    assert.equal(otherProjectResponse.status, 201);
    const otherProject = (await otherProjectResponse.json()) as { id: string };
    assert.equal(
      (
        await adminA.request("/api/v1/engagements", {
          method: "POST",
          body: JSON.stringify({
            ...engagement,
            projectId: otherProject.id,
            startsOn: "2026-10-01",
            endsOn: null,
          }),
        })
      ).status,
      201,
      "a worker may work on multiple projects during the same dates",
    );
    const budgetId = randomUUID();
    const budgetCreate = await adminA.request(`/api/v1/projects/${project.id}/budgets`, {
      method: "PUT",
      body: JSON.stringify([
        { id: budgetId, category: "Labor", amountToman: "9000000", expectedVersion: 0 },
      ]),
    });
    assert.equal(budgetCreate.status, 200, "versioned project budget row is created");
    const budgetUpdate = await adminA.request(`/api/v1/projects/${project.id}/budgets`, {
      method: "PUT",
      body: JSON.stringify([
        { id: budgetId, category: "Workforce", amountToman: "10000000", expectedVersion: 1 },
      ]),
    });
    assert.equal(budgetUpdate.status, 200, "budget labels and entered amounts can be edited");
    const budgetRows = (await budgetUpdate.json()) as Array<{
      category: string;
      amountToman: string;
      baselineToman: string;
      version: number;
    }>;
    assert.deepEqual(
      {
        category: budgetRows[0]?.category,
        amount: budgetRows[0]?.amountToman,
        baseline: budgetRows[0]?.baselineToman,
        version: budgetRows[0]?.version,
      },
      { category: "Workforce", amount: "10000000", baseline: "9000000", version: 2 },
      "budget baseline remains the initial entered amount after label/amount editing",
    );
    const lifecycle = await adminA.request(`/api/v1/projects/${project.id}/lifecycle`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: 1, action: "ARCHIVE", reason: "M1b verification" }),
    });
    assert.equal(lifecycle.status, 201, "project archive records a reason");
    assert.equal(
      (await adminA.request("/api/v1/projects")).status,
      200,
      "active project list stays available",
    );
    const activeProjectList = (await (await adminA.request("/api/v1/projects")).json()) as {
      items: Array<{ id: string }>;
    };
    assert.equal(
      activeProjectList.items.some((row) => row.id === project.id),
      false,
      "archived projects are omitted from the default list",
    );
    const reopen = await adminA.request(`/api/v1/projects/${project.id}/lifecycle`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: 2, action: "REOPEN", reason: "M1b reopen check" }),
    });
    assert.equal(reopen.status, 201, "project can be reopened with a reason");
    const rearchive = await adminA.request(`/api/v1/projects/${project.id}/lifecycle`, {
      method: "POST",
      body: JSON.stringify({ expectedVersion: 3, action: "ARCHIVE", reason: "M1b final archive" }),
    });
    assert.equal(rearchive.status, 201);
    assert.equal(
      (
        await adminA.request("/api/v1/engagements", {
          method: "POST",
          body: JSON.stringify({ ...engagement, startsOn: "2027-01-01", endsOn: null }),
        })
      ).status,
      409,
      "archived projects reject new worker assignments",
    );
    const bootstrap = await adminA.request("/api/v1/sync/bootstrap?limit=1");
    assert.equal(bootstrap.status, 200);
    let bootstrapBody = (await bootstrap.json()) as {
      snapshotId: string;
      cursor: string;
      items: Array<{ entityType: string; entity: { id: string } }>;
      nextCursor: string | null;
    };
    const bootstrapSnapshotId = bootstrapBody.snapshotId;
    const bootstrapRevision = bootstrapBody.cursor;
    const snapshotEntities = [...bootstrapBody.items];
    assert.equal(snapshotEntities.length, 1, "bootstrap page honors its bounded row limit");
    const afterSnapshotProjectResponse = await adminA.request("/api/v1/projects", {
      method: "POST",
      body: JSON.stringify({
        name: "M1b after-snapshot project",
        ownerContactId: null,
        startsOn: null,
        endsOn: null,
        contractInitialToman: "0",
      }),
    });
    assert.equal(afterSnapshotProjectResponse.status, 201);
    const afterSnapshotProject = (await afterSnapshotProjectResponse.json()) as { id: string };
    const firstProjectPage = (await (await adminA.request("/api/v1/projects?limit=1")).json()) as {
      items: Array<{ id: string }>;
      nextCursor: string | null;
    };
    assert.equal(firstProjectPage.items.length, 1);
    assert(firstProjectPage.nextCursor, "project list supplies a bounded next-page cursor");
    const secondProjectPage = (await (
      await adminA.request(
        `/api/v1/projects?limit=1&cursor=${encodeURIComponent(firstProjectPage.nextCursor)}`,
      )
    ).json()) as { items: Array<{ id: string }>; nextCursor: string | null };
    assert.equal(secondProjectPage.items.length, 1);
    assert.notEqual(firstProjectPage.items[0]?.id, secondProjectPage.items[0]?.id);
    assert.equal((await adminA.request("/api/v1/projects?limit=0")).status, 400);
    while (bootstrapBody.nextCursor) {
      const nextPage = await adminA.request(
        `/api/v1/sync/bootstrap?snapshotId=${encodeURIComponent(bootstrapSnapshotId)}&after=${encodeURIComponent(bootstrapBody.nextCursor)}&limit=1`,
      );
      assert.equal(nextPage.status, 200);
      bootstrapBody = (await nextPage.json()) as typeof bootstrapBody;
      assert.equal(bootstrapBody.snapshotId, bootstrapSnapshotId);
      assert.equal(bootstrapBody.cursor, bootstrapRevision);
      snapshotEntities.push(...bootstrapBody.items);
    }
    assert.equal(
      snapshotEntities.some((row) => row.entity.id === afterSnapshotProject.id),
      false,
      "all pages retain the original repeatable-read snapshot across a later commit",
    );
    assert.equal(
      new Set(snapshotEntities.map((row) => `${row.entityType}:${row.entity.id}`)).size,
      snapshotEntities.length,
      "bootstrap pagination returns each record once",
    );
    assert(
      snapshotEntities.some((row) => row.entityType === "PROJECT" && row.entity.id === project.id),
      "consistent bootstrap pages contain project rows from one snapshot",
    );
    const recoveredChanges = await adminA.request(
      `/api/v1/sync/changes?cursor=${encodeURIComponent(bootstrapRevision)}&limit=200`,
    );
    const recoveredBody = (await recoveredChanges.json()) as {
      changes: Array<{ entityId: string }>;
      highWatermark: string;
    };
    assert(
      recoveredBody.changes.some((change) => change.entityId === afterSnapshotProject.id),
      "a commit after bootstrap is recovered from its cursor",
    );
    const changes = await adminA.request(`/api/v1/sync/changes?cursor=0&limit=200`);
    const changesBody = (await changes.json()) as { changes: Array<{ entityId: string }> };
    assert(
      changesBody.changes.some((change) => change.entityId === project.id),
      "change feed includes committed project changes",
    );
    const rowsForProject = await adminA.request(`/api/v1/projects/${project.id}`);
    const projectDetail = (await rowsForProject.json()) as {
      engagements: Array<{ workerId: string }>;
    };
    assert.equal(projectDetail.engagements.length, 7, "project detail retains assignment history");
    const contactArchive = await adminA.request(`/api/v1/contacts/${worker.id}/lifecycle`, {
      method: "POST",
      body: JSON.stringify({
        expectedVersion: 1,
        action: "ARCHIVE",
        reason: "M1b retained history",
      }),
    });
    assert.equal(contactArchive.status, 201, "worker contact archive records a reason");
    assert.equal(
      (
        await adminA.request("/api/v1/engagements", {
          method: "POST",
          body: JSON.stringify({
            ...engagement,
            projectId: otherProject.id,
            startsOn: "2027-01-01",
            endsOn: null,
          }),
        })
      ).status,
      409,
      "archived contacts cannot receive new project assignments",
    );
    const retainedProject = (await (
      await adminA.request(`/api/v1/projects/${project.id}`)
    ).json()) as { engagements: Array<{ workerId: string }> };
    assert(
      retainedProject.engagements.some((row) => row.workerId === worker.id),
      "archiving a worker preserves existing assignment history",
    );
    const businessFixture = postgres(databaseUrl, { max: 1 });
    try {
      const businessDb = drizzle(businessFixture, { schema });
      const [audit] = await businessDb
        .select()
        .from(businessAudit)
        .where(eq(businessAudit.entityId, project.id))
        .limit(1);
      assert.equal(
        audit?.actorUserId,
        normalA.user.id,
        "business audit actor comes from the authenticated session",
      );
    } finally {
      await businessFixture.end({ timeout: 5 });
    }

    const directoryCommandId = randomUUID();
    const directoryEntityId = randomUUID();
    const directoryCommand = {
      commandId: directoryCommandId,
      entityId: directoryEntityId,
      expectedVersion: 0,
      kind: "CONTACT_CREATE",
      payload: {
        displayName: "M1b sync receipt contact",
        phone: null,
        isWorker: false,
        isSupplier: true,
        isOwner: false,
        createdBy: fixtureId,
      },
    };
    const commandResponse = await adminA.request("/api/v1/sync/commands", {
      method: "POST",
      body: JSON.stringify([directoryCommand]),
    });
    assert.equal(commandResponse.status, 201);
    const commandBody = (await commandResponse.json()) as {
      results: Array<{ ok: boolean; result: { replayed: boolean; entity: { id: string } } }>;
    };
    assert.equal(
      commandBody.results[0]?.ok,
      true,
      "authenticated offline directory command applies",
    );
    assert.equal(commandBody.results[0]?.result.entity.id, directoryEntityId);
    assert.equal(commandBody.results[0]?.result.replayed, false);
    const reorderedCommand = {
      payload: {
        isOwner: false,
        isSupplier: true,
        isWorker: false,
        phone: null,
        displayName: "M1b sync receipt contact",
        createdBy: fixtureId,
      },
      kind: "CONTACT_CREATE",
      expectedVersion: 0,
      entityId: directoryEntityId,
      commandId: directoryCommandId,
    };
    const directoryRetry = await adminA.request("/api/v1/sync/commands", {
      method: "POST",
      body: JSON.stringify([reorderedCommand]),
    });
    const retryBody = (await directoryRetry.json()) as {
      results: Array<{ ok: boolean; result: { replayed: boolean; entity: { id: string } } }>;
    };
    assert.equal(retryBody.results[0]?.ok, true);
    assert.equal(
      retryBody.results[0]?.result.replayed,
      true,
      "immutable retry returns its saved result",
    );
    assert.equal(retryBody.results[0]?.result.entity.id, directoryEntityId);
    const changedDirectoryRetry = await adminA.request("/api/v1/sync/commands", {
      method: "POST",
      body: JSON.stringify([
        { ...directoryCommand, payload: { ...directoryCommand.payload, displayName: "Changed" } },
      ]),
    });
    const changedBody = (await changedDirectoryRetry.json()) as {
      results: Array<{ ok: boolean; status: number }>;
    };
    assert.equal(
      changedBody.results[0]?.status,
      409,
      "a changed body cannot reuse a directory command ID",
    );
    const commandAuditClient = postgres(databaseUrl, { max: 1 });
    try {
      const commandAuditDb = drizzle(commandAuditClient, { schema });
      const [commandAudit] = await commandAuditDb
        .select()
        .from(businessAudit)
        .where(eq(businessAudit.entityId, directoryEntityId))
        .limit(1);
      assert.equal(commandAudit?.actorUserId, normalA.user.id, "command actor is server-derived");
    } finally {
      await commandAuditClient.end({ timeout: 5 });
    }

    const createdDraftA = await adminA.request("/api/v1/drafts", {
      method: "POST",
      body: JSON.stringify(commandA),
    });
    assert.equal(createdDraftA.status, 201, "authenticated draft create succeeds");
    const ackA = (await createdDraftA.json()) as {
      commandId: string;
      replayed: boolean;
      draft: { id: string; authorUserId: string; text: string; createdAt: string };
    };
    assert.equal(
      ackA.draft.authorUserId,
      normalA.user.id,
      "server derives the immutable author from the session",
    );
    assert.equal(ackA.draft.id, commandA.entityId);
    const spoofed = await adminA.request("/api/v1/drafts", {
      method: "POST",
      body: JSON.stringify({
        ...draftCommand(randomUUID(), randomUUID(), "spoofed"),
        authorUserId: fixtureId,
      }),
    });
    assert.equal(spoofed.status, 400, "client-supplied authors are rejected");
    const readA = await adminA.request(`/api/v1/drafts/${commandA.entityId}`);
    assert.equal(readA.status, 200, "owner can read a protected draft");
    const readBody = (await readA.json()) as { authorUserId: string; text: string };
    assert.equal(readBody.authorUserId, normalA.user.id);
    assert.equal(readBody.text, commandA.text);

    const retries = await Promise.all(
      Array.from({ length: 8 }, () =>
        adminA.request("/api/v1/drafts", { method: "POST", body: JSON.stringify(commandA) }),
      ),
    );
    assert(
      retries.every((response) => response.status === 201),
      "concurrent authenticated retries all succeed",
    );
    for (const response of retries)
      assert.equal(((await response.json()) as typeof ackA).replayed, true);
    assert.equal(
      (
        await adminA.request("/api/v1/drafts", {
          method: "POST",
          body: JSON.stringify({ ...commandA, text: `${commandA.text} changed` }),
        })
      ).status,
      409,
      "changed-body replay conflicts for its owner",
    );
    assert.equal(
      (
        await adminA.request("/api/v1/drafts", {
          method: "POST",
          body: JSON.stringify({ ...commandA, commandId: randomUUID() }),
        })
      ).status,
      409,
      "duplicate entity UUID remains globally prevented",
    );

    const createdBResponse = await root.request("/api/v1/admins", {
      method: "POST",
      body: JSON.stringify({
        username: `admin-${randomUUID().slice(0, 8)}`,
        displayName: "M1a admin B",
      }),
    });
    assert.equal(createdBResponse.status, 201);
    const createdB = (await createdBResponse.json()) as typeof createdA;
    fixture.push({ id: createdB.admin.id, username: createdB.admin.username });
    const adminB = makeClient(base, origin);
    await adminB.bootstrapCsrf();
    await adminB.login(createdB.admin.username, createdB.temporaryPassword);
    const newPasswordB = randomBytes(32).toString("base64url");
    assert.equal(
      (
        await adminB.request("/api/v1/auth/password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: createdB.temporaryPassword,
            newPassword: newPasswordB,
          }),
        })
      ).status,
      204,
    );
    const normalB = await adminB.login(createdB.admin.username, newPasswordB);
    assert.equal(
      (await adminB.request(`/api/v1/projects/${project.id}`)).status,
      200,
      "company directory data is shared across authenticated admin accounts",
    );
    const sameUserScopedCommand = await adminB.request("/api/v1/sync/commands", {
      method: "POST",
      body: JSON.stringify([
        {
          ...directoryCommand,
          entityId: randomUUID(),
        },
      ]),
    });
    const sameCommandBody = (await sameUserScopedCommand.json()) as {
      results: Array<{ ok: boolean; result?: { replayed: boolean } }>;
    };
    assert.equal(
      sameCommandBody.results[0]?.result?.replayed,
      false,
      "directory command receipts are scoped to the authenticated account",
    );
    const staleTab = makeClient(base, origin);
    await staleTab.bootstrapCsrf();
    const staleSession = await staleTab.login(createdA.admin.username, newPasswordA);
    const staleTabCookie = staleTab.refreshCookie;
    const activeAccountCookie = adminB.refreshCookie;
    assert(staleSession.accessToken && staleTabCookie && activeAccountCookie);
    staleTab.refreshCookie = activeAccountCookie;
    const staleTabLogout = await staleTab.request(
      "/api/v1/auth/logout",
      { method: "POST", body: "{}" },
      { authenticated: false, accessToken: staleSession.accessToken },
    );
    assert.equal(staleTabLogout.status, 204);
    assert.equal(
      staleTabLogout.headers.get("x-session-mismatch"),
      "true",
      "a stale tab detects that its bearer belongs to another session",
    );
    assert.equal(
      staleTab.refreshCookie,
      activeAccountCookie,
      "stale-tab logout leaves the active account refresh cookie untouched",
    );
    assert.equal(
      (await adminB.refresh()).status,
      200,
      "stale-tab logout does not revoke the other account's session",
    );
    staleTab.refreshCookie = staleTabCookie;
    const commandB = draftCommand(commandA.commandId, randomUUID(), "M1a authenticated draft B");
    verificationDrafts.push(commandB.entityId);
    const createdDraftB = await adminB.request("/api/v1/drafts", {
      method: "POST",
      body: JSON.stringify(commandB),
    });
    assert.equal(
      createdDraftB.status,
      201,
      "different user can use the same command UUID without replaying another user's receipt",
    );
    assert.equal(((await createdDraftB.json()) as { replayed: boolean }).replayed, false);
    assert.equal(
      (await adminA.request(`/api/v1/drafts/${commandB.entityId}`)).status,
      404,
      "user A cannot read user B's draft",
    );
    assert.equal(
      (await adminB.request(`/api/v1/drafts/${commandA.entityId}`)).status,
      404,
      "user B cannot read user A's draft",
    );

    const resetResponse = await root.request(`/api/v1/admins/${createdA.admin.id}/reset-password`, {
      method: "POST",
      body: "{}",
    });
    assert.equal(resetResponse.status, 201, "superuser can reset an admin password");
    const reset = (await resetResponse.json()) as {
      admin: { mustChangePassword: boolean };
      temporaryPassword: string;
    };
    assert.equal(reset.admin.mustChangePassword, true);
    assert(
      (await adminA.request("/api/v1/auth/me")).status === 401,
      "password reset immediately revokes an unexpired access token",
    );
    const afterReset = await adminA.login(createdA.admin.username, reset.temporaryPassword);
    assert.equal(
      afterReset.user.mustChangePassword,
      true,
      "reset temporary password requires a forced change",
    );
    const newPasswordAfterReset = randomBytes(32).toString("base64url");
    assert.equal(
      (
        await adminA.request("/api/v1/auth/password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: reset.temporaryPassword,
            newPassword: newPasswordAfterReset,
          }),
        })
      ).status,
      204,
    );
    const activeA = await adminA.login(createdA.admin.username, newPasswordAfterReset);

    const disable = await root.request(`/api/v1/admins/${createdA.admin.id}/status`, {
      method: "POST",
      body: JSON.stringify({ active: false }),
    });
    assert.equal(disable.status, 201, "superuser can disable an admin account");
    assert(
      activeA.expiresAt > Date.now(),
      "the disabled-account test uses a still-unexpired access token",
    );
    const disabledAccess = await adminA.request("/api/v1/auth/me");
    assert.equal(
      disabledAccess.status,
      401,
      "disabled account fails a protected request before JWT expiry",
    );
    assert.equal(((await disabledAccess.json()) as { code: string }).code, "ACCOUNT_DISABLED");
    adminA.accessToken = activeA.accessToken;
    const disabledRefresh = await adminA.refresh();
    assert.equal(disabledRefresh.status, 401, "disabled account cannot refresh its session");
    assert.equal(((await disabledRefresh.json()) as { code: string }).code, "ACCOUNT_DISABLED");
    assert.equal(
      (
        await root.request(`/api/v1/admins/${createdA.admin.id}/status`, {
          method: "POST",
          body: JSON.stringify({ active: true }),
        })
      ).status,
      201,
      "superuser can reactivate an admin",
    );
    await adminA.login(createdA.admin.username, newPasswordAfterReset);

    const logoutAccess = adminA.accessToken;
    assert(logoutAccess);
    assert.equal(
      (await adminA.logout()).status,
      204,
      "logout revokes the refresh family and clears the cookie",
    );
    assert.equal(
      (await adminA.request("/api/v1/auth/me")).status,
      401,
      "logout immediately invalidates access JWTs",
    );

    const bearerLogoutLogin = await adminA.login(createdA.admin.username, newPasswordAfterReset);
    assert(bearerLogoutLogin.expiresAt > Date.now());
    adminA.refreshCookie = undefined;
    assert.equal(
      (
        await adminA.request("/api/v1/auth/logout", {
          method: "POST",
          body: "{}",
        })
      ).status,
      204,
      "logout can revoke a live bearer session when the refresh cookie is absent",
    );
    assert.equal(
      (await adminA.request("/api/v1/auth/me")).status,
      401,
      "bearer-only logout revokes its unexpired access token",
    );

    const expiredLogoutLogin = await adminA.login(createdA.admin.username, newPasswordAfterReset);
    assert(expiredLogoutLogin.accessToken && adminA.refreshCookie);
    const expiredLogout = await adminA.request(
      "/api/v1/auth/logout",
      { method: "POST", body: "{}" },
      {
        authenticated: false,
        accessToken: makeExpiredAccessToken(expiredLogoutLogin.accessToken),
      },
    );
    assert.equal(expiredLogout.status, 204, "logout accepts a signed expired bearer token");
    assert.equal(
      (await adminA.refresh()).status,
      401,
      "expired bearer logout revokes the session and clears its valid refresh cookie",
    );

    const revokeLogin = await adminA.login(createdA.admin.username, newPasswordAfterReset);
    const revokeResponse = await adminA.request("/api/v1/auth/sessions/revoke", {
      method: "POST",
      body: "{}",
    });
    assert.equal(revokeResponse.status, 204, "user can revoke their sessions");
    assert.equal(
      (await adminA.request("/api/v1/auth/me")).status,
      401,
      "session revocation invalidates the current access token",
    );
    assert(revokeLogin.expiresAt > Date.now());

    const replayLogin = await adminA.login(createdA.admin.username, newPasswordAfterReset);
    const oldRefresh = adminA.refreshCookie;
    assert(oldRefresh);
    const rotated = await adminA.refresh();
    assert.equal(rotated.status, 200, "refresh rotates a valid token");
    const newRefresh = adminA.refreshCookie;
    assert(
      newRefresh && newRefresh !== oldRefresh,
      "rotated token differs from the consumed token",
    );
    adminA.refreshCookie = oldRefresh;
    const replay = await adminA.refresh();
    assert.equal(replay.status, 401, "replayed refresh token is rejected");
    assert.equal(
      ((await replay.json()) as { code: string }).code,
      "SESSION_REVOKED",
      "refresh replay has an explicit revocation result",
    );
    adminA.refreshCookie = newRefresh;
    assert.equal((await adminA.refresh()).status, 401, "replay revokes the full refresh family");
    adminA.accessToken = replayLogin.accessToken;
    assert.equal(
      (await adminA.request("/api/v1/auth/me")).status,
      401,
      "refresh replay revokes live access tokens for that session",
    );

    const selfPasswordLogin = await adminA.login(createdA.admin.username, newPasswordAfterReset);
    assert(selfPasswordLogin.expiresAt > Date.now());
    const selfPassword = randomBytes(32).toString("base64url");
    assert.equal(
      (
        await adminA.request("/api/v1/auth/password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: newPasswordAfterReset,
            newPassword: selfPassword,
          }),
        })
      ).status,
      204,
      "an ordinary admin can change their own active password",
    );
    assert.equal(
      (await adminA.request("/api/v1/auth/me")).status,
      401,
      "own-password change revokes the current access token",
    );
    const oldPasswordLogin = await adminA.login(createdA.admin.username, newPasswordAfterReset);
    assert.equal(oldPasswordLogin.status, 401, "the old password stops working after change");
    const newPasswordLogin = await adminA.login(createdA.admin.username, selfPassword);
    assert.equal(newPasswordLogin.user.mustChangePassword, false);

    const throttleClient = makeClient(base, origin);
    await throttleClient.bootstrapCsrf();
    const throttledUsername = `bad-${randomUUID().slice(0, 10)}`;
    let lastStatus = 0;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      lastStatus = (
        await throttleClient.request(
          "/api/v1/auth/login",
          {
            method: "POST",
            body: JSON.stringify({ username: throttledUsername, password: "incorrect" }),
          },
          { authenticated: false },
        )
      ).status;
    }
    assert.equal(lastStatus, 429, "repeated login failures are rate limited");

    const verifyClient = postgres(databaseUrl, { max: 1 });
    try {
      const db = drizzle(verifyClient, { schema });
      const rowsA = await db
        .select()
        .from(authenticatedReceipts)
        .where(
          and(
            eq(authenticatedReceipts.userId, normalA.user.id),
            eq(authenticatedReceipts.commandId, commandA.commandId),
          ),
        );
      const rowsB = await db
        .select()
        .from(authenticatedReceipts)
        .where(
          and(
            eq(authenticatedReceipts.userId, normalB.user.id),
            eq(authenticatedReceipts.commandId, commandA.commandId),
          ),
        );
      assert.equal(rowsA.length, 1);
      assert.equal(rowsB.length, 1);
      const drafts = await db
        .select()
        .from(noteDrafts)
        .where(inArray(noteDrafts.id, verificationDrafts));
      assert(drafts.every((draft) => draft.authorUserId !== null));
    } finally {
      await verifyClient.end({ timeout: 5 });
    }

    process.stdout.write(
      "API M1a/M1b verification passed: identity and account lifecycle, private note receipts, shared project/contact/engagement APIs, archive and date rules, server-derived audit, immutable directory retries, bootstrap recovery and account-scoped receipts.\n",
    );
    verificationSucceeded = true;
  } finally {
    if (server) await stop(server);
    const cleanup = postgres(databaseUrl, { max: 1 });
    try {
      const db = drizzle(cleanup, { schema });
      const ids = fixture.map((entry) => entry.id);
      const removed = await db.transaction(async (tx) => {
        const fixtureSessions = await tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(inArray(sessions.userId, ids));
        const sessionIds = fixtureSessions.map((session) => session.id);
        await tx.delete(businessAudit).where(inArray(businessAudit.actorUserId, ids));
        if (sessionIds.length > 0)
          await tx.delete(businessAudit).where(inArray(businessAudit.actorSessionId, sessionIds));
        await tx.delete(syncChanges).where(inArray(syncChanges.actorUserId, ids));
        await tx.delete(directoryReceipts).where(inArray(directoryReceipts.userId, ids));
        await tx.delete(engagements).where(inArray(engagements.createdBy, ids));
        await tx.delete(projectBudgets).where(inArray(projectBudgets.updatedBy, ids));
        await tx.delete(projects).where(inArray(projects.createdBy, ids));
        await tx.delete(contacts).where(inArray(contacts.createdBy, ids));
        await tx.delete(accountAudit).where(inArray(accountAudit.targetUserId, ids));
        await tx.delete(accountAudit).where(inArray(accountAudit.actorUserId, ids));
        const ownedDrafts = await tx
          .select({ id: noteDrafts.id })
          .from(noteDrafts)
          .where(inArray(noteDrafts.authorUserId, ids));
        const draftIds = [...ownedDrafts.map((draft) => draft.id), ...verificationDrafts];
        if (draftIds.length > 0)
          await tx.delete(noteDrafts).where(inArray(noteDrafts.id, draftIds));
        await tx.delete(authenticatedReceipts).where(inArray(authenticatedReceipts.userId, ids));
        if (sessionIds.length > 0) {
          await tx.delete(refreshTokens).where(inArray(refreshTokens.sessionId, sessionIds));
          await tx.delete(sessions).where(inArray(sessions.id, sessionIds));
        }
        const deletedUsers = await tx
          .delete(users)
          .where(inArray(users.id, ids))
          .returning({ id: users.id });
        return { users: deletedUsers.length, ids: ids.length };
      });
      cleanupInvariantFailed = verificationSucceeded && removed.users !== removed.ids;
      if (verificationSucceeded && !cleanupInvariantFailed)
        process.stdout.write(
          "API verification accounts, sessions, receipts and drafts were cleaned up.\n",
        );
    } finally {
      await cleanup.end({ timeout: 5 });
    }
  }
  if (cleanupInvariantFailed)
    throw new Error("API verification passed but its fixture records were not fully removed");
}

function makeClient(base: string, origin: string) {
  let csrf = "";
  let refreshCookie: string | undefined;
  let accessToken: string | undefined;
  return {
    get csrf() {
      return csrf;
    },
    set accessToken(value: string | undefined) {
      accessToken = value;
    },
    get accessToken() {
      return accessToken;
    },
    get refreshCookie() {
      return refreshCookie;
    },
    set refreshCookie(value: string | undefined) {
      refreshCookie = value;
    },
    async bootstrapCsrf() {
      const response = await fetch(`${base}/api/v1/auth/csrf`, { headers: { origin } });
      assert.equal(response.status, 200);
      csrf = ((await response.json()) as { csrfToken: string }).csrfToken;
    },
    async request(
      path: string,
      init: RequestInit = {},
      options: {
        authenticated?: boolean;
        origin?: string | null;
        includeCsrfHeader?: boolean;
        accessToken?: string;
      } = {},
    ) {
      const headers = new Headers(init.headers);
      if (init.body !== undefined && !headers.has("content-type"))
        headers.set("content-type", "application/json");
      if (options.origin !== null) headers.set("origin", options.origin ?? origin);
      const cookieParts = [
        csrf ? `sazeh_csrf=${csrf}` : "",
        refreshCookie ? `sazeh_refresh=${refreshCookie}` : "",
      ].filter(Boolean);
      if (cookieParts.length > 0) headers.set("cookie", cookieParts.join("; "));
      if (
        options.includeCsrfHeader !== false &&
        csrf &&
        ["POST", "PUT", "PATCH", "DELETE"].includes((init.method ?? "GET").toUpperCase())
      )
        headers.set("x-csrf-token", csrf);
      const bearerToken =
        options.accessToken ?? (options.authenticated !== false ? accessToken : undefined);
      if (bearerToken) headers.set("authorization", `Bearer ${bearerToken}`);
      const response = await fetch(`${base}${path}`, { ...init, headers });
      for (const setCookie of getSetCookies(response)) {
        const match = /^sazeh_refresh=([^;]*)/.exec(setCookie);
        if (match) refreshCookie = match[1] || undefined;
      }
      return response;
    },
    async login(username: string, password: string): Promise<LoginResult> {
      const response = await this.request(
        "/api/v1/auth/login",
        { method: "POST", body: JSON.stringify({ username, password }) },
        { authenticated: false },
      );
      if (!response.ok) {
        const problem = (await response.json().catch(() => undefined)) as
          { code?: string; message?: string } | undefined;
        return {
          status: response.status,
          errorCode: problem?.code,
          errorMessage: problem?.message,
        } as unknown as LoginResult;
      }
      const result = (await response.json()) as LoginResult;
      accessToken = result.accessToken;
      return result;
    },
    async refresh(): Promise<Response> {
      const response = await this.request(
        "/api/v1/auth/refresh",
        { method: "POST", body: "{}" },
        { authenticated: false },
      );
      if (response.ok)
        accessToken = await response.json().then((body) => (body as LoginResult).accessToken);
      return response;
    },
    async logout(): Promise<Response> {
      const response = await this.request(
        "/api/v1/auth/logout",
        { method: "POST", body: "{}" },
        { authenticated: false },
      );
      accessToken = undefined;
      return response;
    },
  };
}

function getSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return (
    headers.getSetCookie?.() ??
    (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : [])
  );
}

function draftCommand(commandId: string, entityId: string, text: string) {
  return {
    protocolVersion: 1,
    commandId,
    entityId,
    expectedVersion: 0,
    kind: "CREATE_NOTE_DRAFT",
    text,
  };
}

function makeExpiredAccessToken(accessToken: string): string {
  const [header, body, signature, extra] = accessToken.split(".");
  assert(header && body && signature && !extra, "fixture access token is a JWT");
  const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>;
  const issuedAt = Math.floor(Date.now() / 1000) - ACCESS_SECONDS - 1;
  claims.iat = issuedAt;
  claims.exp = issuedAt + ACCESS_SECONDS;
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const content = `${header}.${payload}`;
  const mac = createHmac("sha256", process.env.JWT_SECRET!).update(content).digest("base64url");
  return `${content}.${mac}`;
}

async function legacyDraftId(databaseUrl: string): Promise<string> {
  const client = postgres(databaseUrl, { max: 1 });
  try {
    const [draft] = await drizzle(client, { schema })
      .select({ id: noteDrafts.id })
      .from(noteDrafts)
      .where(isNull(noteDrafts.authorUserId))
      .limit(1);
    if (!draft) throw new Error("M1a API proof expects the explicit unowned M0 synthetic seed");
    return draft.id;
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitReady(base: string, server: ChildProcess, output: () => string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`API stopped during startup: ${output()}`);
    try {
      if ((await fetch(`${base}/api/health/ready`)).ok) return;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`API did not become ready: ${output()}`);
}

async function stop(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) return;
  const exited = once(server, "exit");
  server.kill("SIGTERM");
  if (
    (await Promise.race([
      exited.then(() => "exited"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 5_000)),
    ])) === "timeout"
  ) {
    server.kill("SIGKILL");
    await exited;
  }
}

void main();
