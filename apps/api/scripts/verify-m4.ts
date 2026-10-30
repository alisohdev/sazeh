import { mkdir, writeFile } from "node:fs/promises";
import { AttachmentsController } from "../src/attachments/attachments.controller.js";
import type { AuthenticatedRequest } from "../src/identity/access.guard.js";
import { createS3Client, storageSettingsFromEnvironment } from "../src/storage/s3.js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { FinanceReportService, csvCell } from "../src/finance/report.service.js";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { FinanceService } from "../src/finance/finance.service.js";
import type { FinanceDraft } from "@sazeh/contracts";
import type { Principal } from "../src/identity/identity.service.js";
import * as schema from "../src/db/schema.js";
const sql = postgres(process.env.DATABASE_URL!, { max: 5 });
const db = drizzle(sql, { schema });
const service = new FinanceService(db);
const userId = randomUUID(),
  sessionId = randomUUID(),
  projectId = randomUUID();
const actor: Principal = {
  kind: "workspace",
  userId,
  sessionId,
  credentialVersion: 1,
  role: "ADMIN",
};
async function draft(
  kind: FinanceDraft["input"]["kind"],
  amountToman: string,
  sourceId: string | null = null,
  businessDate = "2026-10-01",
) {
  const id = randomUUID();
  await service.save(actor, {
    commandId: randomUUID(),
    recordId: id,
    expectedVersion: 0,
    input: {
      projectId,
      contactId: null,
      kind,
      amountToman,
      businessDate,
      description: "Synthetic M4 verification",
      category: "transport",
      sourceId,
      direction: "INCREASE",
    },
  });
  return id;
}
async function post(id: string) {
  await service.finalize(actor, { commandId: randomUUID(), recordId: id, expectedVersion: 1 });
}
try {
  await db.insert(schema.users).values({
    id: userId,
    username: "m4-" + userId,
    displayName: "M4 synthetic",
    passwordHash: "unused",
    role: "ADMIN",
    mustChangePassword: false,
  });
  await db.insert(schema.sessions).values({
    id: sessionId,
    userId,
    credentialVersion: 1,
    expiresAt: new Date(Date.now() + 3600000),
  });
  await db.insert(schema.projects).values({
    id: projectId,
    name: "M4 synthetic",
    contractInitialToman: "100000000",
    createdBy: userId,
    updatedBy: userId,
  });
  const expense = await draft("EXPENSE", "10000");
  assert.equal((await service.list(projectId)).totals.expenseToman, "0");
  await post(expense);
  const payment = await draft("EXPENSE_PAYMENT", "4000", expense);
  const command = { commandId: randomUUID(), recordId: payment, expectedVersion: 1 };
  await service.finalize(actor, command);
  await service.finalize(actor, command);
  assert.deepEqual((await service.list(projectId)).totals, {
    expenseToman: "10000",
    paidToman: "4000",
    payableToman: "6000",
    amendmentsToman: "0",
    approvedRevenueToman: "0",
    receiptsToman: "0",
    receivableToman: "0",
  });
  await assert.rejects(service.finalize(actor, { ...command, expectedVersion: 2 }));
  await assert.rejects(
    service.reverse(actor, {
      commandId: randomUUID(),
      recordId: expense,
      expectedVersion: 2,
      reason: "dependent payment",
    }),
  );
  const reversal = {
    commandId: randomUUID(),
    recordId: payment,
    expectedVersion: 2,
    reason: "Correction",
  };
  await service.reverse(actor, reversal);
  await service.reverse(actor, reversal);
  assert.equal((await service.list(projectId)).totals.payableToman, "10000");
  await service.reverse(actor, {
    commandId: randomUUID(),
    recordId: expense,
    expectedVersion: 2,
    reason: "Cancel expense",
  });
  assert.equal((await service.list(projectId)).totals.expenseToman, "0");
  const concurrent = await draft("EXPENSE", "18000000");
  const outcomes = await Promise.allSettled([post(concurrent), post(concurrent)]);
  assert.equal(outcomes.filter((r) => r.status === "fulfilled").length, 1);
  for (const [kind, amount] of [
    ["CONTRACT_AMENDMENT", "20000000"],
    ["OWNER_CLAIM", "30000000"],
    ["OWNER_RECEIPT", "20000000"],
  ] as const) {
    const id = await draft(kind, amount);
    await post(id);
    if (kind === "OWNER_CLAIM")
      await service.decision(actor, {
        commandId: randomUUID(),
        recordId: id,
        expectedVersion: 2,
        approvedToman: amount,
        note: "Approved synthetic claim",
      });
  }
  let totals = (await service.list(projectId)).totals;
  assert.equal(totals.amendmentsToman, "20000000");
  assert.equal(totals.receivableToman, "10000000");
  assert.equal(BigInt(totals.approvedRevenueToman!) - BigInt(totals.expenseToman!), 12000000n);
  await post(await draft("OWNER_RECEIPT", "20000000"));
  totals = (await service.list(projectId)).totals;
  assert.equal(totals.receivableToman, "-10000000");
  assert.equal(totals.approvedRevenueToman, "30000000");
  const evidenceParent = await draft("EXPENSE", "1");
  const attachmentsApi = new AttachmentsController(db);
  const request = { principal: actor } as AuthenticatedRequest;
  const fileId = randomUUID();
  const bytes = Buffer.from("89504e470d0a1a0a00000000", "hex");
  const ticket = await attachmentsApi.ticket(
    {
      id: fileId,
      recordId: evidenceParent,
      filename: "synthetic.png",
      mediaType: "image/png",
      size: bytes.length,
    },
    request,
  );
  assert(ticket.url);
  console.log("M4 evidence: ticket issued");
  const upload = await fetch(ticket.url, {
    signal: AbortSignal.timeout(15000),
    method: "PUT",
    headers: { "Content-Type": "image/png" },
    body: bytes,
  });
  assert(upload.ok, await upload.text());
  console.log("M4 evidence: uploaded");
  await assert.rejects(
    service.finalize(actor, {
      commandId: randomUUID(),
      recordId: evidenceParent,
      expectedVersion: 1,
    }),
  );
  console.log("M4 evidence: completing");
  await attachmentsApi.complete(fileId, request);
  await attachmentsApi.complete(fileId, request);
  assert.equal(
    (
      await attachmentsApi.ticket(
        {
          id: fileId,
          recordId: evidenceParent,
          filename: "synthetic.png",
          mediaType: "image/png",
          size: bytes.length,
        },
        request,
      )
    ).state,
    "READY",
  );
  const download = await attachmentsApi.download(fileId, request);
  assert.deepEqual(Buffer.from(await (await fetch(download.url)).arrayBuffer()), bytes);
  const unsigned = new URL(download.url);
  unsigned.search = "";
  assert.equal((await fetch(unsigned)).ok, false, "ready objects must remain private");
  const settings = storageSettingsFromEnvironment()!;
  const storage = createS3Client(settings);
  for (const key of ["private/" + fileId, "ready/" + fileId])
    await storage.send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: key }));
  await attachmentsApi.ticket(
    {
      id: randomUUID(),
      recordId: projectId,
      parentType: "PROJECT",
      filename: "contract.pdf",
      mediaType: "application/pdf",
      size: 5,
    },
    request,
  );
  const workerId = randomUUID(),
    invoiceId = randomUUID(),
    workerPaymentId = randomUUID();
  await db.insert(schema.contacts).values({
    id: workerId,
    displayName: "Evidence worker and supplier",
    isWorker: true,
    isSupplier: true,
    createdBy: userId,
    updatedBy: userId,
  });
  await db.insert(schema.workforceRecords).values({
    id: workerPaymentId,
    projectId,
    workerId,
    kind: "WORKER_PAYMENT",
    paymentKind: "PAYMENT",
    amountToman: "10",
    businessDate: "2026-10-01",
    description: "Evidence worker payment",
    createdBy: userId,
    updatedBy: userId,
  });
  await db.insert(schema.procurementDocuments).values({
    id: invoiceId,
    projectId,
    supplierId: workerId,
    kind: "PURCHASE_INVOICE",
    businessDate: "2026-10-01",
    description: "Evidence purchase invoice",
    createdBy: userId,
    updatedBy: userId,
  });
  for (const [parentType, recordId] of [
    ["PROJECT", projectId],
    ["WORKFORCE", workerPaymentId],
    ["PROCUREMENT", invoiceId],
  ] as const) {
    const id = randomUUID();
    const input = {
      id,
      recordId,
      parentType,
      filename: "parent.png",
      mediaType: "image/png",
      size: bytes.length,
    };
    await assert.rejects(
      attachmentsApi.ticket({ ...input, id: randomUUID() }, {
        principal: { ...actor, sessionId: randomUUID() },
      } as AuthenticatedRequest),
    );
    const grant = await attachmentsApi.ticket(input, request);
    assert(grant.url);
    assert(
      (
        await fetch(grant.url, {
          method: "PUT",
          headers: { "Content-Type": "image/png" },
          body: bytes,
        })
      ).ok,
    );
    await attachmentsApi.complete(id, request);
    await attachmentsApi.complete(id, request);
    assert.equal((await attachmentsApi.list(recordId)).filter((f) => f.id === id).length, 1);
    await assert.rejects(
      attachmentsApi.ticket(
        { ...input, parentType: parentType === "PROJECT" ? "WORKFORCE" : "PROJECT" },
        request,
      ),
    );
    for (const key of ["private/" + id, "ready/" + id])
      await storage.send(new DeleteObjectCommand({ Bucket: settings.bucket, Key: key }));
  }
  await assert.rejects(
    attachmentsApi.ticket(
      {
        id: randomUUID(),
        recordId: randomUUID(),
        parentType: "PROJECT",
        filename: "missing.png",
        mediaType: "image/png",
        size: bytes.length,
      },
      request,
    ),
  );
  const reportService = new FinanceReportService(db);
  const report = await reportService.report({ projectId });
  assert.equal(report.contractValueToman, "120000000");
  assert.equal(report.totals.receivableToman, "-10000000");
  assert.equal(report.totals.managementMarginToman, "12000000");
  const filtered = await reportService.report({ projectId, from: "2026-10-02", to: "2026-10-31" });
  assert.equal(filtered.totals.incurredCostToman, "0");
  assert.equal(filtered.opening.incurredCostToman, filtered.closing.incurredCostToman);
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  await db.insert(schema.projectBudgets).values({
    id: randomUUID(),
    projectId,
    category: "transport",
    amountToman: "5000000",
    baselineToman: "5000000",
    updatedBy: userId,
  });
  await post(await draft("EXPENSE", "100000", null, "2026-07-01"));
  const adjusted = await draft("EXPENSE", "200000", null, "2026-08-01");
  await post(adjusted);
  await service.reverse(actor, {
    commandId: randomUUID(),
    recordId: adjusted,
    expectedVersion: 2,
    reason: "Synthetic correction",
  });
  await post(await draft("EXPENSE", "300000", null, "2026-09-01"));
  const projectB = randomUUID();
  await db
    .insert(schema.projects)
    .values({ id: projectB, name: "M4 second project", createdBy: userId, updatedBy: userId });
  await db.insert(schema.projectBudgets).values({
    id: randomUUID(),
    projectId: projectB,
    category: "transport",
    amountToman: "9000000",
    baselineToman: "9000000",
    updatedBy: userId,
  });
  const secondId = randomUUID();
  await service.save(actor, {
    commandId: randomUUID(),
    recordId: secondId,
    expectedVersion: 0,
    input: {
      projectId: projectB,
      contactId: null,
      kind: "EXPENSE",
      amountToman: "700",
      businessDate: "2026-10-01",
      category: "transport",
      description: "Second project",
      sourceId: null,
      direction: "INCREASE",
    },
  });
  await post(secondId);
  const company = await reportService.report({});
  const budgetB = company.budgets.find((b) => b.projectId === projectB)!;
  assert.equal(budgetB.costToman, "700", "same-category costs must stay in their project");
  const multiMonth = await reportService.report({ projectId });
  assert.equal(
    company.budgets.find((b) => b.projectId === projectId)!.costToman,
    multiMonth.totals.incurredCostToman,
    "project A must not receive project B cost",
  );
  assert(multiMonth.months.length >= 4);
  assert(BigInt(multiMonth.budgets[0]!.varianceToman) < 0n);
  for (const [key, value] of Object.entries(multiMonth.totals))
    assert.equal(
      BigInt(multiMonth.opening[key as keyof typeof multiMonth.opening]) + BigInt(value),
      BigInt(multiMonth.closing[key as keyof typeof multiMonth.closing]),
    );
  await mkdir("../../output/m4", { recursive: true });
  await writeFile(
    "../../output/m4/reconciliation.json",
    JSON.stringify({ scenario: "Synthetic FIN03/FIN04", report, filtered, multiMonth }, null, 2) +
      "\n",
  );
  await writeFile(
    "../../output/m4/statement.csv",
    [
      "id,date,kind,category,cost,cashIn,cashOut,revenue",
      ...report.entries.map((r) =>
        [r.id, r.date, r.kind, r.category, r.cost, r.cashIn, r.cashOut, r.revenue]
          .map(csvCell)
          .join(","),
      ),
    ].join("\r\n"),
  );
  console.log(
    "M4 PostgreSQL passed: FIN02, FIN03, FIN04, drafts excluded, immutable replay, changed-body rejection, concurrent posting, dependency reversal, reversal replay.",
  );
} finally {
  await sql.begin(async (tx) => {
    await tx`delete from attachments where created_by=${userId}`;
    await tx`delete from attachment_targets where finance_id in (select id from finance_records where created_by=${userId}) or project_id in (select id from projects where created_by=${userId}) or workforce_id in (select id from workforce_records where created_by=${userId}) or procurement_id in (select id from procurement_documents where created_by=${userId})`;
    await tx`delete from workforce_records where created_by=${userId}`;
    await tx`delete from procurement_documents where created_by=${userId}`;
    await tx`delete from contacts where created_by=${userId}`;
    await tx`delete from finance_records where project_id in (select id from projects where created_by=${userId})`;
    await tx`delete from finance_command_receipts where user_id=${userId}`;
    await tx`delete from business_audit where actor_user_id=${userId}`;
    await tx`delete from project_budgets where project_id in (select id from projects where created_by=${userId})`;
    await tx`delete from projects where created_by=${userId}`;
    await tx`delete from sessions where id=${sessionId}`;
    await tx`delete from users where id=${userId}`;
  });
  await sql.end();
}
