import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import argon2 from "argon2";
import postgres from "postgres";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema.js";
import {
  accountAudit,
  authenticatedReceipts,
  businessAudit,
  contacts,
  directoryReceipts,
  engagements,
  loginBuckets,
  noteDrafts,
  projectBudgets,
  projects,
  refreshTokens,
  sessions,
  syncChanges,
  users,
} from "../src/db/schema.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const require = createRequire(resolve(root, "package.json"));
type BrowserAccountFixture = {
  id: string;
  username: string;
  displayName: string;
  password: string;
  role: "SUPERUSER" | "ADMIN";
  mustChangePassword: boolean;
};

async function main(): Promise<void> {
  if (process.env.APP_ENV !== "local")
    throw new Error("Browser verification requires APP_ENV=local");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");

  const runId = randomUUID();
  const fixtures: BrowserAccountFixture[] = [
    {
      id: randomUUID(),
      username: `m1abrowser-${runId.slice(0, 8)}`,
      displayName: "M1a browser superuser",
      password: randomBytes(32).toString("base64url"),
      role: "SUPERUSER",
      mustChangePassword: false,
    },
    {
      id: randomUUID(),
      username: `m1abrowser-admin-${runId.slice(0, 8)}`,
      displayName: "M1a browser admin",
      password: randomBytes(32).toString("base64url"),
      role: "ADMIN",
      mustChangePassword: true,
    },
  ];
  const syncMarker = `M1A_BROWSER_SYNC::${runId}`;
  const privateMarker = `M1A_BROWSER_PRIVATE::${runId}`;
  const client = postgres(databaseUrl, { max: 1 });
  const db = drizzle(client, { schema });

  try {
    await db.transaction(async (tx) => {
      for (const fixture of fixtures) {
        await tx.insert(users).values({
          id: fixture.id,
          username: fixture.username,
          displayName: fixture.displayName,
          passwordHash: await argon2.hash(fixture.password, {
            type: argon2.argon2id,
            memoryCost: 19_456,
            timeCost: 2,
            parallelism: 1,
          }),
          role: fixture.role,
          active: true,
          mustChangePassword: fixture.mustChangePassword,
          credentialVersion: 1,
        });
      }
    });

    const apiPort = await freePort();
    const cliPath = require.resolve("@playwright/test/cli");
    const browserArgs = process.argv.slice(2).filter((argument) => argument !== "--");
    const exitCode = await new Promise<number>((resolveExit, reject) => {
      const child = spawn(process.execPath, [cliPath, "test", ...browserArgs], {
        cwd: root,
        env: {
          ...process.env,
          M1A_TEST_RUN_ID: runId,
          M1A_TEST_USER_ID: fixtures[0]!.id,
          M1A_TEST_USERNAME: fixtures[0]!.username,
          M1A_TEST_PASSWORD: fixtures[0]!.password,
          M1A_TEST_ALT_USERNAME: fixtures[1]!.username,
          M1A_TEST_ALT_PASSWORD: fixtures[1]!.password,
          AUTH_ALLOWED_ORIGIN: "http://127.0.0.1:4173",
          API_PORT: String(apiPort),
          API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
        },
        stdio: "inherit",
      });
      child.once("error", reject);
      child.once("exit", (code) => resolveExit(code ?? 1));
    });
    assert.equal(exitCode, 0, "authenticated offline browser verification passes");

    if (browserArgs.length === 0) {
      const syncedDrafts = await db
        .select()
        .from(noteDrafts)
        .where(eq(noteDrafts.text, syncMarker));
      assert.equal(syncedDrafts.length, 1, "concurrent tabs create one server draft");
      assert.equal(
        syncedDrafts[0]!.authorUserId,
        fixtures[0]!.id,
        "server records the authenticated browser fixture as author",
      );
      const privateDrafts = await db
        .select()
        .from(noteDrafts)
        .where(eq(noteDrafts.text, privateMarker));
      assert.equal(
        privateDrafts.length,
        0,
        "the next account never uploads the previous account's pending command",
      );
    }
    process.stdout.write(
      browserArgs.length === 0
        ? "Browser M1a/M1b verification passed: authenticated offline notes and directories, sync recovery, account isolation, parent ordering, conflict resolution and mobile RTL.\n"
        : "Filtered authenticated browser verification passed.\n",
    );
  } finally {
    const ids = fixtures.map((fixture) => fixture.id);
    await db.transaction(async (tx) => {
      await tx.delete(accountAudit).where(inArray(accountAudit.actorUserId, ids));
      await tx.delete(accountAudit).where(inArray(accountAudit.targetUserId, ids));
      await tx.delete(businessAudit).where(inArray(businessAudit.actorUserId, ids));
      await tx.delete(syncChanges).where(inArray(syncChanges.actorUserId, ids));
      await tx.delete(directoryReceipts).where(inArray(directoryReceipts.userId, ids));
      await tx.delete(engagements).where(inArray(engagements.createdBy, ids));
      await tx.delete(projectBudgets).where(inArray(projectBudgets.updatedBy, ids));
      await tx.delete(projects).where(inArray(projects.createdBy, ids));
      await tx.delete(contacts).where(inArray(contacts.createdBy, ids));
      await tx.delete(noteDrafts).where(inArray(noteDrafts.authorUserId, ids));
      await tx.delete(authenticatedReceipts).where(inArray(authenticatedReceipts.userId, ids));
      const fixtureSessions = await tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(inArray(sessions.userId, ids));
      const sessionIds = fixtureSessions.map((session) => session.id);
      if (sessionIds.length > 0) {
        await tx.delete(refreshTokens).where(inArray(refreshTokens.sessionId, sessionIds));
        await tx.delete(sessions).where(inArray(sessions.id, sessionIds));
      }
      await tx.delete(loginBuckets).where(
        inArray(
          loginBuckets.key,
          fixtures.map((fixture) =>
            createHash("sha256").update(`username:${fixture.username}`).digest("hex"),
          ),
        ),
      );
      const removed = await tx
        .delete(users)
        .where(inArray(users.id, ids))
        .returning({ id: users.id });
      assert.equal(removed.length, ids.length, "browser verification fixture accounts are removed");
    });
    await client.end({ timeout: 5 });
  }
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
  await new Promise<void>((resolveClose, reject) => {
    server.close((error) => (error ? reject(error) : resolveClose()));
  });
  return port;
}

void main();
