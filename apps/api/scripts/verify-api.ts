import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import * as schema from "../src/db/schema.js";
import { commandReceipts, noteDrafts } from "../src/db/schema.js";

async function main(): Promise<void> {
  if (process.env.APP_ENV !== "local") throw new Error("API verification requires APP_ENV=local");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const command = {
    protocolVersion: 1,
    commandId: randomUUID(),
    entityId: randomUUID(),
    expectedVersion: 0,
    kind: "CREATE_NOTE_DRAFT",
    text: `M0 API verification ${randomUUID()}`,
  };
  let server: ChildProcess | undefined;
  let childOutput = "";
  const start = async () => {
    server = spawn(process.execPath, ["--env-file=../../.env", "dist/main.js"], {
      cwd: process.cwd(),
      env: { ...process.env, APP_ENV: "local", API_PORT: String(port) },
      stdio: ["ignore", "ignore", "pipe"],
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
    const liveness = await fetch(`${base}/api/health/live`);
    assert.equal(liveness.status, 200, "API liveness endpoint should pass");
    const health = await fetch(`${base}/api/health/ready`);
    assert.equal(health.status, 200, "API readiness endpoint should pass");

    const first = await post(base, command);
    assert.equal(first.status, 201, "first command should create a draft");
    const firstResult = (await first.json()) as {
      commandId: string;
      draft: { id: string; createdAt: string };
      replayed: boolean;
    };
    assert.equal(firstResult.replayed, false);
    assert.equal(firstResult.draft.id, command.entityId);

    const retries = await Promise.all(Array.from({ length: 8 }, () => post(base, command)));
    assert(
      retries.every((response) => response.status === 201),
      "concurrent retries should replay successfully",
    );
    for (const response of retries) {
      const result = (await response.json()) as typeof firstResult;
      assert.equal(result.commandId, command.commandId);
      assert.equal(result.draft.id, firstResult.draft.id);
      assert.equal(result.draft.createdAt, firstResult.draft.createdAt);
      assert.equal(result.replayed, true);
    }

    const changedContent = await post(base, { ...command, text: `${command.text} changed` });
    assert.equal(changedContent.status, 409, "same command ID with changed content must conflict");
    const newCommandSameEntity = await post(base, { ...command, commandId: randomUUID() });
    assert.equal(
      newCommandSameEntity.status,
      409,
      "a new command cannot duplicate an existing draft ID",
    );

    await stop(server);
    server = undefined;
    await start();
    const afterRestart = await post(base, command);
    assert.equal(
      afterRestart.status,
      201,
      "retry after API restart should replay the stored result",
    );
    const restartedResult = (await afterRestart.json()) as typeof firstResult;
    assert.equal(restartedResult.replayed, true);
    assert.equal(restartedResult.draft.createdAt, firstResult.draft.createdAt);

    const persisted = await fetch(`${base}/api/v1/drafts/${command.entityId}`);
    assert.equal(persisted.status, 200);
    const persistedDraft = (await persisted.json()) as { id: string; text: string };
    assert.equal(persistedDraft.id, command.entityId);
    assert.equal(persistedDraft.text, command.text);

    const client = postgres(databaseUrl, { max: 1 });
    try {
      const db = drizzle(client, { schema });
      const drafts = await db.select().from(noteDrafts).where(eq(noteDrafts.id, command.entityId));
      const receipts = await db
        .select()
        .from(commandReceipts)
        .where(eq(commandReceipts.commandId, command.commandId));
      assert.equal(drafts.length, 1, "one PostgreSQL draft must exist");
      assert.equal(receipts.length, 1, "one durable command receipt must exist");
    } finally {
      await client.end({ timeout: 5 });
    }

    process.stdout.write(
      "API verification passed: concurrent retries, changed-body conflict, entity conflict, and API restart persistence.\n",
    );
    verificationSucceeded = true;
  } finally {
    if (server) await stop(server);
    const cleanup = postgres(databaseUrl, { max: 1 });
    try {
      const db = drizzle(cleanup, { schema });
      const removed = await db.transaction(async (tx) => {
        const receipts = await tx
          .delete(commandReceipts)
          .where(eq(commandReceipts.commandId, command.commandId))
          .returning({ commandId: commandReceipts.commandId });
        const drafts = await tx
          .delete(noteDrafts)
          .where(eq(noteDrafts.id, command.entityId))
          .returning({ id: noteDrafts.id });
        return { receipts: receipts.length, drafts: drafts.length };
      });
      cleanupInvariantFailed =
        verificationSucceeded && (removed.receipts !== 1 || removed.drafts !== 1);
      if (verificationSucceeded && !cleanupInvariantFailed) {
        process.stdout.write("API verification rows were cleaned up.\n");
      }
    } finally {
      await cleanup.end({ timeout: 5 });
    }
  }
  if (cleanupInvariantFailed) {
    throw new Error("API verification passed but its synthetic rows were not cleaned up");
  }
}

async function post(base: string, payload: unknown): Promise<Response> {
  return fetch(`${base}/api/v1/drafts`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  const port = address.port;
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
      const response = await fetch(`${base}/api/health/ready`);
      if (response.ok) return;
    } catch {
      // Retry until Nest has opened its port.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`API did not become ready: ${output()}`);
}

async function stop(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) return;
  const exited = once(server, "exit");
  server.kill("SIGTERM");
  const result = await Promise.race([
    exited.then(() => "exited"),
    new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 5_000)),
  ]);
  if (result === "timeout") {
    server.kill("SIGKILL");
    await exited;
  }
}

void main();
