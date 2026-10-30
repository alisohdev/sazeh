import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ProcurementSaveCommandSchema, type ProcurementDocumentInput } from "@sazeh/contracts";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ProcurementService } from "../src/procurement/procurement.service.js";
import type { Principal } from "../src/identity/identity.service.js";
import * as schema from "../src/db/schema.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");
const client = postgres(url, { max: 12, idle_timeout: 10, connect_timeout: 10 });
const db = drizzle(client, { schema });
const service = new ProcurementService(db);
const ids = {
  users: [randomUUID(), randomUUID()],
  sessions: [randomUUID(), randomUUID()],
  projects: [randomUUID(), randomUUID()],
  suppliers: [randomUUID(), randomUUID()],
  materials: [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()],
};

const principals: Principal[] = ids.users.map((userId, index) => ({
  kind: "workspace",
  userId,
  sessionId: ids.sessions[index]!,
  credentialVersion: 1,
  role: "ADMIN",
}));

type LoadedDocument = {
  id: string;
  version: number;
  status: string;
  lines: Array<{ id: string; materialId: string }>;
};

function line(materialId: string, quantity: string, unitPriceToman?: string) {
  return {
    id: randomUUID(),
    materialId,
    quantity,
    ...(unitPriceToman ? { unitPriceToman } : {}),
  };
}

async function saveOne(command: object, principal = principals[0]!) {
  return service.save(principal, ProcurementSaveCommandSchema.parse(command));
}

async function draft(input: ProcurementDocumentInput, principal = principals[0]!) {
  const entityId = randomUUID();
  const result = await saveOne(
    {
      commandType: "DOCUMENT_UPSERT",
      commandId: randomUUID(),
      entityId,
      expectedVersion: 0,
      input,
    },
    principal,
  );
  return result as LoadedDocument;
}

async function finalize(
  loaded: LoadedDocument,
  principal = principals[0]!,
  commandId = randomUUID(),
) {
  return service.finalize(principal, {
    commandId,
    recordId: loaded.id,
    expectedVersion: loaded.version,
  });
}

async function balance(projectId: string, materialId: string) {
  const rows = await db
    .select()
    .from(schema.stockBalances)
    .where(eq(schema.stockBalances.projectId, projectId));
  const row = rows.find((item) => item.materialId === materialId);
  return row ?? { quantity: "0.000", carryingValueToman: "0" };
}

async function expectRejected(work: Promise<unknown>, code: string) {
  await assert.rejects(work, (error: unknown) => {
    const response =
      error && typeof error === "object" && "getResponse" in error
        ? (error as { getResponse(): unknown }).getResponse()
        : undefined;
    return Boolean(
      response && typeof response === "object" && "code" in response && response.code === code,
    );
  });
}

async function createFixtures() {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await db.insert(schema.users).values(
    ids.users.map((id, index) => ({
      id,
      username: `m3-verify-${id}`,
      displayName: `M3 verifier ${index + 1}`,
      passwordHash: "not-used-by-service-verification",
      role: "ADMIN" as const,
      mustChangePassword: false,
    })),
  );
  await db.insert(schema.sessions).values(
    ids.sessions.map((id, index) => ({
      id,
      userId: ids.users[index]!,
      credentialVersion: 1,
      expiresAt,
    })),
  );
  await db.insert(schema.contacts).values(
    ids.suppliers.map((id, index) => ({
      id,
      displayName: `تامین‌کننده آزمون ${index + 1}`,
      isSupplier: true,
      createdBy: ids.users[0]!,
      updatedBy: ids.users[0]!,
    })),
  );
  await db.insert(schema.projects).values(
    ids.projects.map((id, index) => ({
      id,
      name: `پروژه آزمون موجودی ${index + 1}`,
      createdBy: ids.users[0]!,
      updatedBy: ids.users[0]!,
    })),
  );
  for (const [index, entityId] of ids.materials.entries()) {
    await saveOne({
      commandType: "MATERIAL_UPSERT",
      commandId: randomUUID(),
      entityId,
      expectedVersion: 0,
      input: { name: `مصالح آزمون ${index + 1}`, baseUnit: "کیلوگرم" },
    });
  }
}

async function invoiceAndReceipt(
  materialId: string,
  quantity: string,
  unitPriceToman: string,
  receiveAllNow = false,
) {
  const invoice = await draft({
    kind: "PURCHASE_INVOICE",
    projectId: ids.projects[0]!,
    supplierId: ids.suppliers[0]!,
    businessDate: "2026-10-01",
    description: "فاکتور آزمون موجودی",
    receiveAllNow,
    lines: [line(materialId, quantity, unitPriceToman)],
  });
  const finalized = await finalize(invoice);
  if (receiveAllNow) {
    const linked = (finalized as { linkedReceipt: { id: string } }).linkedReceipt;
    assert(linked?.id, "receive-all must create a linked receipt atomically");
    const receiptLines = await db
      .select()
      .from(schema.procurementLines)
      .where(eq(schema.procurementLines.documentId, linked.id));
    return { invoice, receipt: { ...linked, lines: receiptLines } as LoadedDocument };
  }
  const receipt = await draft({
    kind: "STOCK_RECEIPT",
    projectId: ids.projects[0]!,
    supplierId: ids.suppliers[0]!,
    invoiceId: invoice.id,
    businessDate: "2026-10-02",
    description: "رسید آزمون موجودی",
    lines: [{ id: randomUUID(), invoiceLineId: invoice.lines[0]!.id, quantity }],
  });
  await finalize(receipt);
  return { invoice, receipt };
}

async function verifyStockAndValuation() {
  const materialId = ids.materials[0]!;
  const first = await invoiceAndReceipt(materialId, "100", "200");
  await invoiceAndReceipt(materialId, "100", "300");
  assert.deepEqual(
    pickBalance(await balance(ids.projects[0]!, materialId)),
    { quantity: "200.000", carryingValueToman: "50000" },
    "STOCK01 receipt must establish weighted-average stock",
  );

  const issue = await draft({
    kind: "STOCK_ISSUE",
    projectId: ids.projects[0]!,
    businessDate: "2026-10-03",
    description: "مصرف میانگین موزون",
    lines: [line(materialId, "50")],
  });
  await finalize(issue);
  assert.deepEqual(pickBalance(await balance(ids.projects[0]!, materialId)), {
    quantity: "150.000",
    carryingValueToman: "37500",
  });

  const transfer = await draft({
    kind: "STOCK_TRANSFER",
    projectId: ids.projects[0]!,
    destinationProjectId: ids.projects[1]!,
    businessDate: "2026-10-04",
    description: "انتقال اتمیک",
    lines: [line(materialId, "20")],
  });
  await finalize(transfer);
  assert.deepEqual(pickBalance(await balance(ids.projects[0]!, materialId)), {
    quantity: "130.000",
    carryingValueToman: "32500",
  });
  assert.deepEqual(pickBalance(await balance(ids.projects[1]!, materialId)), {
    quantity: "20.000",
    carryingValueToman: "5000",
  });

  const consumptionReturn = await draft({
    kind: "STOCK_RETURN",
    projectId: ids.projects[0]!,
    sourceDocumentId: issue.id,
    businessDate: "2026-10-05",
    description: "برگشت بخشی از مصرف",
    lines: [{ id: randomUUID(), sourceLineId: issue.lines[0]!.id, quantity: "10" }],
  });
  await finalize(consumptionReturn);
  assert.deepEqual(pickBalance(await balance(ids.projects[0]!, materialId)), {
    quantity: "140.000",
    carryingValueToman: "35000",
  });

  const supplierReturn = await draft({
    kind: "SUPPLIER_RETURN",
    projectId: ids.projects[0]!,
    supplierId: ids.suppliers[0]!,
    sourceDocumentId: first.receipt.id,
    businessDate: "2026-10-06",
    description: "مرجوعی با تعدیل ارزش‌گذاری",
    lines: [{ id: randomUUID(), sourceLineId: first.receipt.lines[0]!.id, quantity: "10" }],
  });
  await finalize(supplierReturn);
  const [returnLine] = await db
    .select()
    .from(schema.procurementLines)
    .where(eq(schema.procurementLines.documentId, supplierReturn.id));
  assert.equal(returnLine?.carryingValueToman, "2500");
  assert.equal(returnLine?.supplierCreditToman, "2000");
  assert.equal(returnLine?.valuationAdjustmentToman, "500");
  assert.deepEqual(pickBalance(await balance(ids.projects[0]!, materialId)), {
    quantity: "130.000",
    carryingValueToman: "32500",
  });

  const report = await service.report({ projectId: ids.projects[0]!, materialId });
  assert.doesNotThrow(() => JSON.stringify(report), "reports must be JSON serializable");
  assert.equal(report.totals.consumptionCostToman, "10000");
  assert.equal(report.totals.valuationAdjustmentToman, "500");
  assert.equal(report.totals.stockValueToman, "32500");
  assert(report.drillDownIds.includes(issue.id));
}

async function verifyConcurrencyAndReplay() {
  const materialId = ids.materials[1]!;
  await invoiceAndReceipt(materialId, "100", "100", true);
  const competing = await Promise.all([
    draft(
      {
        kind: "STOCK_ISSUE",
        projectId: ids.projects[0]!,
        businessDate: "2026-10-10",
        description: "برداشت رقیب اول",
        lines: [line(materialId, "80")],
      },
      principals[0]!,
    ),
    draft(
      {
        kind: "STOCK_ISSUE",
        projectId: ids.projects[0]!,
        businessDate: "2026-10-10",
        description: "برداشت رقیب دوم",
        lines: [line(materialId, "80")],
      },
      principals[1]!,
    ),
  ]);
  const outcomes = await Promise.allSettled([
    finalize(competing[0]!, principals[0]!),
    finalize(competing[1]!, principals[1]!),
  ]);
  assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(outcomes.filter((item) => item.status === "rejected").length, 1);
  assert.deepEqual(pickBalance(await balance(ids.projects[0]!, materialId)), {
    quantity: "20.000",
    carryingValueToman: "2000",
  });

  const replayMaterial = ids.materials[2]!;
  const replayCommandId = randomUUID();
  const replayBody = {
    commandType: "MATERIAL_UPSERT",
    commandId: replayCommandId,
    entityId: replayMaterial,
    expectedVersion: 1,
    input: { name: "مصالح آزمون بازپخش", baseUnit: "عدد" },
  };
  const first = await saveOne(replayBody);
  const replay = (await saveOne(replayBody)) as { replayed?: boolean; result?: unknown };
  assert.equal(replay.replayed, true, "lost reply retry must return the stored result");
  assert(replay.result || first);
  await assert.rejects(
    saveOne({ ...replayBody, input: { ...replayBody.input, name: "changed body" } }),
    (error: unknown) =>
      error instanceof Error &&
      "getStatus" in error &&
      (error as { getStatus(): number }).getStatus() === 409,
  );

  const invoice = await draft({
    kind: "PURCHASE_INVOICE",
    projectId: ids.projects[0]!,
    supplierId: ids.suppliers[0]!,
    businessDate: "2026-10-11",
    description: "تکرار ثبت نهایی",
    receiveAllNow: true,
    lines: [line(replayMaterial, "2.5", "1001")],
  });
  const commandId = randomUUID();
  await finalize(invoice, principals[0]!, commandId);
  const repeated = (await finalize(invoice, principals[0]!, commandId)) as { replayed?: boolean };
  assert.equal(repeated.replayed, true);
  const [stored] = await db
    .select()
    .from(schema.procurementDocuments)
    .where(eq(schema.procurementDocuments.id, invoice.id));
  assert.equal(stored?.totalToman, "2503", "line totals must round half-up to whole toman");

  const transferDrafts = await Promise.all([
    draft(
      {
        kind: "STOCK_TRANSFER",
        projectId: ids.projects[0]!,
        destinationProjectId: ids.projects[1]!,
        businessDate: "2026-10-12",
        description: "انتقال رقیب اول",
        lines: [line(replayMaterial, "2")],
      },
      principals[0]!,
    ),
    draft(
      {
        kind: "STOCK_TRANSFER",
        projectId: ids.projects[0]!,
        destinationProjectId: ids.projects[1]!,
        businessDate: "2026-10-12",
        description: "انتقال رقیب دوم",
        lines: [line(replayMaterial, "2")],
      },
      principals[1]!,
    ),
  ]);
  const transferOutcomes = await Promise.allSettled([
    finalize(transferDrafts[0]!, principals[0]!),
    finalize(transferDrafts[1]!, principals[1]!),
  ]);
  assert.equal(transferOutcomes.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(transferOutcomes.filter((item) => item.status === "rejected").length, 1);
  assert.deepEqual(pickBalance(await balance(ids.projects[0]!, replayMaterial)), {
    quantity: "0.500",
    carryingValueToman: "501",
  });
  assert.deepEqual(pickBalance(await balance(ids.projects[1]!, replayMaterial)), {
    quantity: "2.000",
    carryingValueToman: "2002",
  });
}

async function verifyPartialDeliveryAndFinance() {
  const invoice = await draft({
    kind: "PURCHASE_INVOICE",
    projectId: ids.projects[1]!,
    supplierId: ids.suppliers[1]!,
    businessDate: "2026-10-20",
    description: "فاکتور مالی و تحویل مرحله‌ای",
    receiveAllNow: false,
    lines: [line(ids.materials[0]!, "50", "1000")],
  });
  await finalize(invoice);
  for (const quantity of ["20", "30"]) {
    const receipt = await draft({
      kind: "STOCK_RECEIPT",
      projectId: ids.projects[1]!,
      supplierId: ids.suppliers[1]!,
      invoiceId: invoice.id,
      businessDate: "2026-10-21",
      description: `تحویل مرحله‌ای ${quantity}`,
      lines: [{ id: randomUUID(), invoiceLineId: invoice.lines[0]!.id, quantity }],
    });
    await finalize(receipt);
  }
  const excess = await draft({
    kind: "STOCK_RECEIPT",
    projectId: ids.projects[1]!,
    supplierId: ids.suppliers[1]!,
    invoiceId: invoice.id,
    businessDate: "2026-10-22",
    description: "تحویل مازاد نامعتبر",
    lines: [{ id: randomUUID(), invoiceLineId: invoice.lines[0]!.id, quantity: "1" }],
  });
  await expectRejected(finalize(excess), "RECEIPT_EXCEEDS_INVOICE");

  const payment = await draft({
    kind: "SUPPLIER_PAYMENT",
    projectId: ids.projects[1]!,
    supplierId: ids.suppliers[1]!,
    businessDate: "2026-10-22",
    description: "پرداخت بخشی بدهی",
    amountToman: "20000",
    allocations: [{ invoiceId: invoice.id, amountToman: "20000" }],
  });
  await finalize(payment);
  const report = await service.report({
    projectId: ids.projects[1]!,
    supplierId: ids.suppliers[1]!,
  });
  assert.equal(report.totals.procurementToman, "50000");
  assert.equal(report.totals.paymentsToman, "20000");
  assert.equal(report.totals.outstandingDebtToman, "30000");
  assert.equal(report.totals.supplierAdvanceToman, "0");

  await expectRejected(
    service.reverse(principals[0]!, {
      commandId: randomUUID(),
      recordId: invoice.id,
      expectedVersion: 2,
      reason: "اصلاح پس از وابستگی",
    }),
    "DEPENDENCIES_EXIST",
  );
}

async function verifyDuplicateReceiptReferences() {
  const materialId = ids.materials[3]!;
  const invoice = await draft({
    kind: "PURCHASE_INVOICE",
    projectId: ids.projects[0]!,
    supplierId: ids.suppliers[0]!,
    businessDate: "2026-10-23",
    description: "Duplicate receipt source regression",
    receiveAllNow: false,
    lines: [line(materialId, "100", "10")],
  });
  await finalize(invoice);
  const receipt = await draft({
    kind: "STOCK_RECEIPT",
    projectId: ids.projects[0]!,
    supplierId: ids.suppliers[0]!,
    invoiceId: invoice.id,
    businessDate: "2026-10-24",
    description: "Two receipt lines against one invoice line",
    lines: [
      { id: randomUUID(), invoiceLineId: invoice.lines[0]!.id, quantity: "60" },
      { id: randomUUID(), invoiceLineId: invoice.lines[0]!.id, quantity: "60" },
    ],
  });
  await expectRejected(finalize(receipt), "DUPLICATE_SOURCE_LINE");
  assert.deepEqual(pickBalance(await balance(ids.projects[0]!, materialId)), {
    quantity: "0.000",
    carryingValueToman: "0",
  });

  const sourceReceipt = await invoiceAndReceipt(materialId, "100", "10");
  await invoiceAndReceipt(materialId, "100", "10");
  const supplierReturn = await draft({
    kind: "SUPPLIER_RETURN",
    projectId: ids.projects[0]!,
    supplierId: ids.suppliers[0]!,
    sourceDocumentId: sourceReceipt.receipt.id,
    businessDate: "2026-10-27",
    description: "Two supplier returns against one receipt line",
    lines: [
      {
        id: randomUUID(),
        sourceLineId: sourceReceipt.receipt.lines[0]!.id,
        quantity: "60",
      },
      {
        id: randomUUID(),
        sourceLineId: sourceReceipt.receipt.lines[0]!.id,
        quantity: "60",
      },
    ],
  });
  await expectRejected(finalize(supplierReturn), "DUPLICATE_SOURCE_LINE");
  assert.deepEqual(pickBalance(await balance(ids.projects[0]!, materialId)), {
    quantity: "200.000",
    carryingValueToman: "2000",
  });

  const validReceipt = await draft({
    kind: "STOCK_RECEIPT",
    projectId: ids.projects[0]!,
    supplierId: ids.suppliers[0]!,
    invoiceId: invoice.id,
    businessDate: "2026-10-24",
    description: "Valid receipt for return regression",
    lines: [{ id: randomUUID(), invoiceLineId: invoice.lines[0]!.id, quantity: "100" }],
  });
  await finalize(validReceipt);
  const issue = await draft({
    kind: "STOCK_ISSUE",
    projectId: ids.projects[0]!,
    businessDate: "2026-10-25",
    description: "Issue for duplicate consumption return regression",
    lines: [line(materialId, "100")],
  });
  await finalize(issue);
  const consumptionReturn = await draft({
    kind: "STOCK_RETURN",
    projectId: ids.projects[0]!,
    sourceDocumentId: issue.id,
    businessDate: "2026-10-26",
    description: "Two returns against one consumption line",
    lines: [
      { id: randomUUID(), sourceLineId: issue.lines[0]!.id, quantity: "60" },
      { id: randomUUID(), sourceLineId: issue.lines[0]!.id, quantity: "60" },
    ],
  });
  await expectRejected(finalize(consumptionReturn), "DUPLICATE_SOURCE_LINE");
  assert.deepEqual(pickBalance(await balance(ids.projects[0]!, materialId)), {
    quantity: "200.000",
    carryingValueToman: "2000",
  });
}

async function verifyPartialReceiptValueConservation() {
  const materialId = ids.materials[4]!;
  const invoice = await draft({
    kind: "PURCHASE_INVOICE",
    projectId: ids.projects[1]!,
    supplierId: ids.suppliers[1]!,
    businessDate: "2026-10-28",
    description: "One-toman partial delivery regression",
    receiveAllNow: false,
    lines: [line(materialId, "1", "1")],
  });
  await finalize(invoice);
  for (const description of ["First half", "Final half"]) {
    const receipt = await draft({
      kind: "STOCK_RECEIPT",
      projectId: ids.projects[1]!,
      supplierId: ids.suppliers[1]!,
      invoiceId: invoice.id,
      businessDate: "2026-10-29",
      description,
      lines: [{ id: randomUUID(), invoiceLineId: invoice.lines[0]!.id, quantity: "0.5" }],
    });
    await finalize(receipt);
  }
  assert.deepEqual(pickBalance(await balance(ids.projects[1]!, materialId)), {
    quantity: "1.000",
    carryingValueToman: "1",
  });
}

async function verifySupplierCreditConservation() {
  const materialId = ids.materials[5]!;
  const source = await invoiceAndReceipt(materialId, "1", "1");
  const returns: LoadedDocument[] = [];
  for (const description of ["First credit half", "Final credit half"]) {
    const supplierReturn = await draft({
      kind: "SUPPLIER_RETURN",
      projectId: ids.projects[0]!,
      supplierId: ids.suppliers[0]!,
      sourceDocumentId: source.receipt.id,
      businessDate: "2026-10-30",
      description,
      lines: [
        {
          id: randomUUID(),
          sourceLineId: source.receipt.lines[0]!.id,
          quantity: "0.5",
        },
      ],
    });
    await finalize(supplierReturn);
    returns.push(supplierReturn);
  }
  let totalCredit = 0n;
  for (const supplierReturn of returns) {
    const [stored] = await db
      .select()
      .from(schema.procurementDocuments)
      .where(eq(schema.procurementDocuments.id, supplierReturn.id));
    totalCredit += BigInt(stored?.totalToman ?? "0");
  }
  assert.equal(totalCredit, 1n, "supplier credits must conserve the stored source-line value");
  assert.deepEqual(pickBalance(await balance(ids.projects[0]!, materialId)), {
    quantity: "0.000",
    carryingValueToman: "0",
  });
}

async function verifyFilteredReportsAndSeparatedBalances() {
  const mixedInvoice = await draft({
    kind: "PURCHASE_INVOICE",
    projectId: ids.projects[0]!,
    supplierId: ids.suppliers[0]!,
    businessDate: "2026-11-01",
    description: "Mixed-material report regression",
    receiveAllNow: false,
    lines: [line(ids.materials[0]!, "2", "50"), line(ids.materials[1]!, "3", "100")],
  });
  await finalize(mixedInvoice);
  const unrelatedPayment = await draft({
    kind: "SUPPLIER_PAYMENT",
    projectId: ids.projects[1]!,
    supplierId: ids.suppliers[1]!,
    businessDate: "2026-11-01",
    description: "Unrelated payment outside material sources",
    amountToman: "100",
    allocations: [],
  });
  await finalize(unrelatedPayment);

  const materialReport = await service.report({
    materialId: ids.materials[0]!,
    from: "2026-11-01",
    to: "2026-11-01",
  });
  assert.equal(materialReport.totals.procurementToman, "100");
  assert.equal(materialReport.totals.paymentsToman, "0");
  assert.equal(materialReport.totals.outstandingDebtToman, "100");
  assert.equal(materialReport.totals.supplierAdvanceToman, "0");
  assert.equal(materialReport.entries.length, 1);
  assert.equal(materialReport.entries[0]?.id, mixedInvoice.id);
  assert.deepEqual(
    materialReport.entries[0]?.lines.map((item) => item.materialId),
    [ids.materials[0]!],
  );
  assert.equal(materialReport.purchasesBySupplier[0]?.amountToman, "100");
  assert.equal(materialReport.purchasesByMaterial[0]?.amountToman, "100");
  assert.deepEqual(materialReport.drillDownIds, [mixedInvoice.id]);

  const debtInvoice = await draft({
    kind: "PURCHASE_INVOICE",
    projectId: ids.projects[0]!,
    supplierId: ids.suppliers[0]!,
    businessDate: "2026-11-02",
    description: "Supplier debt grouping regression",
    receiveAllNow: false,
    lines: [line(ids.materials[0]!, "1", "100")],
  });
  await finalize(debtInvoice);
  const advancePayment = await draft({
    kind: "SUPPLIER_PAYMENT",
    projectId: ids.projects[1]!,
    supplierId: ids.suppliers[1]!,
    businessDate: "2026-11-02",
    description: "Supplier advance grouping regression",
    amountToman: "100",
    allocations: [],
  });
  await finalize(advancePayment);
  const groupedReport = await service.report({ from: "2026-11-02", to: "2026-11-02" });
  assert.equal(groupedReport.totals.procurementToman, "100");
  assert.equal(groupedReport.totals.paymentsToman, "100");
  assert.equal(groupedReport.totals.outstandingDebtToman, "100");
  assert.equal(groupedReport.totals.supplierAdvanceToman, "100");
}

function pickBalance(row: { quantity: string; carryingValueToman: string }) {
  return { quantity: row.quantity, carryingValueToman: row.carryingValueToman };
}

async function cleanup() {
  const userIds = ids.users;
  const projectIds = ids.projects;
  const materialIds = ids.materials;
  await client.begin(async (sql) => {
    await sql`delete from stock_movements where document_id in (select id from procurement_documents where project_id = any(${projectIds}::uuid[]))`;
    await sql`delete from supplier_payment_allocations where payment_document_id in (select id from procurement_documents where project_id = any(${projectIds}::uuid[])) or invoice_document_id in (select id from procurement_documents where project_id = any(${projectIds}::uuid[]))`;
    await sql`delete from procurement_lines where document_id in (select id from procurement_documents where project_id = any(${projectIds}::uuid[]))`;
    await sql`delete from procurement_documents where project_id = any(${projectIds}::uuid[])`;
    await sql`delete from stock_balances where project_id = any(${projectIds}::uuid[])`;
    await sql`delete from procurement_command_receipts where user_id = any(${userIds}::uuid[])`;
    await sql`delete from business_audit where actor_user_id = any(${userIds}::uuid[])`;
    await sql`delete from materials where id = any(${materialIds}::uuid[])`;
    await sql`delete from projects where id = any(${projectIds}::uuid[])`;
    await sql`delete from contacts where id = any(${ids.suppliers}::uuid[])`;
    await sql`delete from sessions where id = any(${ids.sessions}::uuid[])`;
    await sql`delete from users where id = any(${userIds}::uuid[])`;
  });
}

try {
  await createFixtures();
  await verifyStockAndValuation();
  await verifyConcurrencyAndReplay();
  await verifyPartialDeliveryAndFinance();
  await verifyDuplicateReceiptReferences();
  await verifyPartialReceiptValueConservation();
  await verifySupplierCreditConservation();
  await verifyFilteredReportsAndSeparatedBalances();
  console.log(
    "M3 verification passed: STOCK01-05, FIN01, replay/conflict, duplicate finalization and source rejection, partial-value conservation, filtered reports, COR02, concurrency, and rounding.",
  );
} finally {
  await cleanup();
  await client.end({ timeout: 5 });
}
