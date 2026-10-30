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
  materials,
  procurementDocuments,
  procurementLines,
  procurementReceipts,
  refreshTokens,
  sessions,
  stockBalances,
  stockMovements,
  supplierPaymentAllocations,
  syncChanges,
  users,
  workforceRecords,
  workforceReceipts,
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
  const workforceProject = {
    id: randomUUID(),
    name: `پروژهٔ صورت‌حساب ${runId.slice(0, 6)}`,
  };
  const workforceWorker = {
    id: randomUUID(),
    name: `کارگر صورت‌حساب ${runId.slice(0, 6)}`,
  };
  const workforceEngagementId = randomUUID();
  const procurementFixture = {
    supplierId: randomUUID(),
    supplierName: `تأمین‌کننده موبایل ${runId.slice(0, 6)}`,
    materialId: randomUUID(),
    materialName: `سیمان آزمون ${runId.slice(0, 6)}`,
  };
  const reviewSamples = [
    {
      workerId: randomUUID(),
      workerName: `Review sample LAB01 ${runId.slice(0, 6)}`,
      projectId: randomUUID(),
      projectName: `Review project LAB01 ${runId.slice(0, 6)}`,
    },
    {
      workerId: randomUUID(),
      workerName: `Review sample period ${runId.slice(0, 6)}`,
      projectId: randomUUID(),
      projectName: `Review project period ${runId.slice(0, 6)}`,
    },
  ];
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
      await tx.insert(contacts).values({
        id: workforceWorker.id,
        displayName: workforceWorker.name,
        phone: null,
        isWorker: true,
        isSupplier: false,
        isOwner: false,
        archived: false,
        createdBy: fixtures[0]!.id,
        updatedBy: fixtures[0]!.id,
      });
      await tx.insert(contacts).values({
        id: procurementFixture.supplierId,
        displayName: procurementFixture.supplierName,
        phone: null,
        isWorker: false,
        isSupplier: true,
        isOwner: false,
        archived: false,
        createdBy: fixtures[0]!.id,
        updatedBy: fixtures[0]!.id,
      });
      await tx.insert(projects).values({
        id: workforceProject.id,
        name: workforceProject.name,
        ownerContactId: null,
        startsOn: "2020-01-01",
        endsOn: null,
        lifecycle: "ACTIVE",
        contractInitialToman: "0",
        createdBy: fixtures[0]!.id,
        updatedBy: fixtures[0]!.id,
      });
      await tx.insert(engagements).values({
        id: workforceEngagementId,
        workerId: workforceWorker.id,
        projectId: workforceProject.id,
        type: "DAILY",
        defaultRateToman: "1000000",
        startsOn: "2020-01-01",
        endsOn: null,
        archived: false,
        createdBy: fixtures[0]!.id,
        updatedBy: fixtures[0]!.id,
      });
      await tx.insert(materials).values({
        id: procurementFixture.materialId,
        name: procurementFixture.materialName,
        baseUnit: "کیسه",
        archived: false,
        createdBy: fixtures[0]!.id,
        updatedBy: fixtures[0]!.id,
      });
      for (const sample of reviewSamples) {
        await tx.insert(contacts).values({
          id: sample.workerId,
          displayName: sample.workerName,
          phone: null,
          isWorker: true,
          isSupplier: false,
          isOwner: false,
          archived: false,
          createdBy: fixtures[0]!.id,
          updatedBy: fixtures[0]!.id,
        });
        await tx.insert(projects).values({
          id: sample.projectId,
          name: sample.projectName,
          ownerContactId: null,
          startsOn: "2020-01-01",
          endsOn: null,
          lifecycle: "ACTIVE",
          contractInitialToman: "0",
          createdBy: fixtures[0]!.id,
          updatedBy: fixtures[0]!.id,
        });
      }
      const actorId = fixtures[0]!.id;
      const finalizedAt = new Date();
      const reviewRecords: Array<typeof workforceRecords.$inferInsert> = [
        {
          id: randomUUID(),
          projectId: reviewSamples[0]!.projectId,
          workerId: reviewSamples[0]!.workerId,
          kind: "EARNING",
          businessDate: "2026-10-29",
          engagementType: "DAILY",
          quantity: "3",
          rateToman: "1000000",
          amountToman: "3000000",
          paymentKind: null,
          description: "LAB01 gross earnings",
          status: "FINALIZED",
          version: 2,
          createdBy: actorId,
          updatedBy: actorId,
          finalizedBy: actorId,
          finalizedAt,
        },
        {
          id: randomUUID(),
          projectId: reviewSamples[0]!.projectId,
          workerId: reviewSamples[0]!.workerId,
          kind: "DEDUCTION",
          businessDate: "2026-10-29",
          engagementType: null,
          quantity: null,
          rateToman: null,
          amountToman: "200000",
          paymentKind: null,
          description: "LAB01 deduction",
          status: "FINALIZED",
          version: 2,
          createdBy: actorId,
          updatedBy: actorId,
          finalizedBy: actorId,
          finalizedAt,
        },
        {
          id: randomUUID(),
          projectId: reviewSamples[0]!.projectId,
          workerId: reviewSamples[0]!.workerId,
          kind: "WORKER_PAYMENT",
          businessDate: "2026-10-29",
          engagementType: null,
          quantity: null,
          rateToman: null,
          amountToman: "500000",
          paymentKind: "ADVANCE",
          description: "LAB01 advance",
          status: "FINALIZED",
          version: 2,
          createdBy: actorId,
          updatedBy: actorId,
          finalizedBy: actorId,
          finalizedAt,
        },
        {
          id: randomUUID(),
          projectId: reviewSamples[0]!.projectId,
          workerId: reviewSamples[0]!.workerId,
          kind: "WORKER_PAYMENT",
          businessDate: "2026-10-29",
          engagementType: null,
          quantity: null,
          rateToman: null,
          amountToman: "1000000",
          paymentKind: "PAYMENT",
          description: "LAB01 payment",
          status: "FINALIZED",
          version: 2,
          createdBy: actorId,
          updatedBy: actorId,
          finalizedBy: actorId,
          finalizedAt,
        },
        {
          id: randomUUID(),
          projectId: reviewSamples[1]!.projectId,
          workerId: reviewSamples[1]!.workerId,
          kind: "EARNING",
          businessDate: "2026-10-27",
          engagementType: "DAILY",
          quantity: "1",
          rateToman: "1000000",
          amountToman: "1000000",
          paymentKind: null,
          description: "Opening balance earning",
          status: "FINALIZED",
          version: 2,
          createdBy: actorId,
          updatedBy: actorId,
          finalizedBy: actorId,
          finalizedAt,
        },
        {
          id: randomUUID(),
          projectId: reviewSamples[1]!.projectId,
          workerId: reviewSamples[1]!.workerId,
          kind: "WORKER_PAYMENT",
          businessDate: "2026-10-28",
          engagementType: null,
          quantity: null,
          rateToman: null,
          amountToman: "200000",
          paymentKind: "PAYMENT",
          description: "Payment in selected period",
          status: "FINALIZED",
          version: 2,
          createdBy: actorId,
          updatedBy: actorId,
          finalizedBy: actorId,
          finalizedAt,
        },
      ];
      await tx.insert(workforceRecords).values(reviewRecords);
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
          M2_TEST_PROJECT_NAME: workforceProject.name,
          M2_TEST_WORKER_NAME: workforceWorker.name,
          M2_TEST_ENGAGEMENT_ID: workforceEngagementId,
          M2_REVIEW_LAB01_WORKER_ID: reviewSamples[0]!.workerId,
          M2_REVIEW_LAB01_PROJECT_ID: reviewSamples[0]!.projectId,
          M2_REVIEW_PERIOD_WORKER_ID: reviewSamples[1]!.workerId,
          M2_REVIEW_PERIOD_PROJECT_ID: reviewSamples[1]!.projectId,
          M3_TEST_PROJECT_ID: workforceProject.id,
          M3_TEST_PROJECT_NAME: workforceProject.name,
          M3_TEST_SUPPLIER_ID: procurementFixture.supplierId,
          M3_TEST_SUPPLIER_NAME: procurementFixture.supplierName,
          M3_TEST_MATERIAL_ID: procurementFixture.materialId,
          M3_TEST_MATERIAL_NAME: procurementFixture.materialName,
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
      const finalizedWorkforce = await db
        .select()
        .from(workforceRecords)
        .where(eq(workforceRecords.projectId, workforceProject.id));
      assert.equal(
        finalizedWorkforce.length,
        1,
        "M2 browser flow creates exactly one workforce record",
      );
      assert.equal(finalizedWorkforce[0]!.workerId, workforceWorker.id);
      assert.equal(finalizedWorkforce[0]!.createdBy, fixtures[0]!.id);
      assert.equal(finalizedWorkforce[0]!.kind, "EARNING");
      assert.equal(finalizedWorkforce[0]!.status, "FINALIZED");
      assert.equal(finalizedWorkforce[0]!.amountToman, "3000000");
      assert.equal(finalizedWorkforce[0]!.quantity, "3");
      assert.equal(finalizedWorkforce[0]!.rateToman, "1000000");
      assert.equal(
        finalizedWorkforce[0]!.description,
        `Edited workforce ${runId.slice(0, 6)}`,
        "offline revision reaches the one finalized server record",
      );
    }
    process.stdout.write(
      browserArgs.length === 0
        ? "Browser M1a/M1b/M2 verification passed: authenticated offline notes and directories, sync recovery, account isolation, parent ordering, conflict resolution, workforce lost-reply replay, explicit finalization and mobile RTL.\n"
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
      await tx.delete(workforceReceipts).where(inArray(workforceReceipts.userId, ids));
      await tx.delete(procurementReceipts).where(inArray(procurementReceipts.userId, ids));
      const fixtureDocuments = await tx
        .select({ id: procurementDocuments.id })
        .from(procurementDocuments)
        .where(inArray(procurementDocuments.createdBy, ids));
      const documentIds = fixtureDocuments.map((document) => document.id);
      if (documentIds.length > 0) {
        await tx.delete(stockMovements).where(inArray(stockMovements.documentId, documentIds));
        await tx
          .delete(supplierPaymentAllocations)
          .where(inArray(supplierPaymentAllocations.paymentDocumentId, documentIds));
        await tx
          .delete(supplierPaymentAllocations)
          .where(inArray(supplierPaymentAllocations.invoiceDocumentId, documentIds));
        await tx.delete(procurementLines).where(inArray(procurementLines.documentId, documentIds));
        await tx.delete(procurementDocuments).where(inArray(procurementDocuments.id, documentIds));
      }
      await tx.delete(stockBalances).where(eq(stockBalances.projectId, workforceProject.id));
      await tx.delete(materials).where(inArray(materials.createdBy, ids));
      await tx.delete(workforceRecords).where(inArray(workforceRecords.createdBy, ids));
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
