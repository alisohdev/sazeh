import { requireReadyEvidence } from "../attachments/pending-evidence.js";
import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  MaterialInputSchema,
  ProcurementDocumentInputSchema,
  ProcurementReportFilterSchema,
  ProcurementSyncCommandSchema,
  type ProcurementDocumentInput,
  type ProcurementFinalizeCommand,
  type ProcurementReportFilter,
  type ProcurementReverseCommand,
  type ProcurementSyncCommand,
} from "@sazeh/contracts";
import { and, asc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import { ZodError } from "zod";
import { DATABASE, type Database } from "../db/database.module.js";
import {
  businessAudit,
  contacts,
  materials,
  procurementDocuments,
  procurementLines,
  procurementReceipts,
  projects,
  stockBalances,
  stockMovements,
  supplierPaymentAllocations,
  syncChanges,
  syncRevision,
} from "../db/schema.js";
import { claimsFor, requireLiveSession, type Principal } from "../identity/identity.service.js";
import {
  formatQuantity,
  invoiceLineTotal,
  parseMoney,
  parseQuantity,
  parseStoredQuantity,
  proportionalValue,
  roundHalfUp,
} from "./decimal.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type DocumentRow = typeof procurementDocuments.$inferSelect;
type LineRow = typeof procurementLines.$inferSelect;
type BalanceRow = typeof stockBalances.$inferSelect;

const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
};

@Injectable()
export class ProcurementService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async sync(principal: Principal, commands: unknown[]) {
    if (commands.length > 100)
      throw new BadRequestException({
        code: "BATCH_TOO_LARGE",
        message: "At most 100 procurement commands may be synchronized at once",
      });
    const results = [];
    for (const raw of commands) {
      try {
        const command = ProcurementSyncCommandSchema.parse(raw);
        const result = await this.applySyncCommand(principal, command);
        results.push({ ok: true, result });
      } catch (error) {
        results.push({ ok: false, status: statusOf(error), error: problemOf(error) });
      }
    }
    return { results };
  }

  async materials(archived?: boolean) {
    return this.db
      .select()
      .from(materials)
      .where(archived === undefined ? undefined : eq(materials.archived, archived))
      .orderBy(asc(materials.name), asc(materials.id));
  }

  async finalize(principal: Principal, command: ProcurementFinalizeCommand) {
    return this.withReceipt(principal, command.commandId, command, async (tx) => {
      this.requireWorkspacePrincipal(principal);
      const document = await this.lockDocument(tx, command.recordId);
      this.expectDraftVersion(document, command.expectedVersion);
      await this.requireActiveProject(tx, document.projectId);
      await requireReadyEvidence(tx, document.id, command.acknowledgePendingEvidence);
      if (document.destinationProjectId)
        await this.requireActiveProject(tx, document.destinationProjectId);
      if (document.supplierId) await this.requireSupplier(tx, document.supplierId, true);
      const lines = await tx
        .select()
        .from(procurementLines)
        .where(eq(procurementLines.documentId, document.id))
        .orderBy(asc(procurementLines.id))
        .for("update");
      await this.requireActiveMaterials(
        tx,
        [...new Set(lines.map((line) => line.materialId))].sort(),
      );

      if (document.kind === "SUPPLIER_PAYMENT") await this.validatePaymentAllocations(tx, document);
      if (document.kind === "STOCK_RECEIPT") await this.validateReceipt(tx, document, lines);
      if (document.kind === "STOCK_RETURN") await this.postConsumptionReturn(tx, document, lines);
      else if (document.kind === "SUPPLIER_RETURN")
        await this.postSupplierReturn(tx, document, lines);
      else if (document.kind === "STOCK_RECEIPT") await this.postReceipt(tx, document, lines);
      else if (document.kind === "STOCK_ISSUE") await this.postIssue(tx, document, lines);
      else if (document.kind === "STOCK_TRANSFER") await this.postTransfer(tx, document, lines);

      const finalized = await this.markFinalized(tx, principal, document);
      let linkedReceipt: DocumentRow | undefined;
      if (document.kind === "PURCHASE_INVOICE" && document.receiveAllNow) {
        linkedReceipt = await this.createReceiveAllReceipt(tx, principal, finalized, lines);
      }
      await this.record(
        tx,
        principal,
        "PROCUREMENT_DOCUMENT",
        document.id,
        "FINALIZE",
        document,
        finalized,
      );
      return linkedReceipt ? { document: finalized, linkedReceipt } : finalized;
    });
  }

  async reverse(principal: Principal, command: ProcurementReverseCommand) {
    return this.withReceipt(principal, command.commandId, command, async (tx) => {
      this.requireWorkspacePrincipal(principal);
      const current = await this.lockDocument(tx, command.recordId);
      if (current.version !== command.expectedVersion)
        throw staleVersion("procurement record", current);
      if (current.reversalOfId)
        throw new ConflictException({
          code: "REVERSAL_NOT_REVERSIBLE",
          message: "A reversal record cannot be reversed",
        });
      if (current.status !== "FINALIZED")
        throw new ConflictException({
          code: "RECORD_NOT_REVERSIBLE",
          message: "Only a finalized procurement record can be reversed",
        });
      if (current.kind === "PURCHASE_INVOICE") {
        const dependencies = await this.invoiceDependencies(tx, current.id);
        if (dependencies.length)
          throw new ConflictException({
            code: "DEPENDENCIES_EXIST",
            message: `Reverse dependent records first: ${dependencies.join(", ")}`,
            dependencies,
          });
      }
      if (!["PURCHASE_INVOICE", "SUPPLIER_PAYMENT"].includes(current.kind))
        throw new ConflictException({
          code: "CURRENT_ADJUSTMENT_REQUIRED",
          message: "Stock documents are corrected with a linked return or current adjustment",
        });
      const [reversal] = await tx
        .insert(procurementDocuments)
        .values({
          id: randomUUID(),
          projectId: current.projectId,
          supplierId: current.supplierId,
          kind: current.kind,
          businessDate: current.businessDate,
          description: current.description,
          totalToman: current.totalToman,
          status: "FINALIZED",
          reversalOfId: current.id,
          reversalReason: command.reason,
          createdBy: principal.userId,
          updatedBy: principal.userId,
          finalizedBy: principal.userId,
          finalizedAt: new Date(),
        })
        .returning();
      if (!reversal) throw new Error("Procurement reversal insert returned no row");
      const [reversed] = await tx
        .update(procurementDocuments)
        .set({
          status: "REVERSED",
          version: current.version + 1,
          updatedBy: principal.userId,
          updatedAt: new Date(),
        })
        .where(eq(procurementDocuments.id, current.id))
        .returning();
      if (!reversed) throw new Error("Procurement reversal source update returned no row");
      await this.record(
        tx,
        principal,
        "PROCUREMENT_DOCUMENT",
        current.id,
        "REVERSE",
        current,
        reversed,
        command.reason,
      );
      await this.record(
        tx,
        principal,
        "PROCUREMENT_DOCUMENT",
        reversal.id,
        "REVERSAL_POSTED",
        null,
        reversal,
        command.reason,
      );
      return { original: reversed, reversal };
    });
  }

  async report(rawFilter: ProcurementReportFilter) {
    const filter = ProcurementReportFilterSchema.parse(rawFilter);
    const conditions = [
      filter.projectId ? eq(procurementDocuments.projectId, filter.projectId) : undefined,
      filter.supplierId ? eq(procurementDocuments.supplierId, filter.supplierId) : undefined,
      filter.from ? gte(procurementDocuments.businessDate, filter.from) : undefined,
      filter.to ? lte(procurementDocuments.businessDate, filter.to) : undefined,
    ].filter(Boolean);
    const documents = await this.db
      .select()
      .from(procurementDocuments)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(asc(procurementDocuments.businessDate), asc(procurementDocuments.createdAt));
    const documentIds = documents.map((row) => row.id);
    let lines = documentIds.length
      ? await this.db
          .select()
          .from(procurementLines)
          .where(inArray(procurementLines.documentId, documentIds))
      : [];
    if (filter.materialId) lines = lines.filter((line) => line.materialId === filter.materialId);
    const lineMap = new Map<string, LineRow[]>();
    for (const line of lines)
      lineMap.set(line.documentId, [...(lineMap.get(line.documentId) ?? []), line]);
    const visibleDocumentIds = filter.materialId
      ? new Set(lines.map((line) => line.documentId))
      : new Set(documentIds);
    for (const row of documents)
      if (row.reversalOfId && visibleDocumentIds.has(row.reversalOfId)) {
        visibleDocumentIds.add(row.id);
        const sourceLines = lineMap.get(row.reversalOfId) ?? [];
        lineMap.set(
          row.id,
          sourceLines.map((line) => ({ ...line, documentId: row.id })),
        );
      }
    const visibleDocuments = documents.filter((row) => visibleDocumentIds.has(row.id));
    const [projectRows, supplierRows, materialRows, balances] = await Promise.all([
      this.db.select().from(projects),
      this.db.select().from(contacts),
      this.db.select().from(materials),
      this.db
        .select()
        .from(stockBalances)
        .where(
          and(
            filter.projectId ? eq(stockBalances.projectId, filter.projectId) : undefined,
            filter.materialId ? eq(stockBalances.materialId, filter.materialId) : undefined,
          ),
        ),
    ]);
    const projectNames = new Map(projectRows.map((row) => [row.id, row.name]));
    const supplierNames = new Map(supplierRows.map((row) => [row.id, row.displayName]));
    const materialNames = new Map(materialRows.map((row) => [row.id, row.name]));
    const finalized = visibleDocuments.filter((row) => row.status !== "DRAFT");
    const signed = (row: DocumentRow) => (row.reversalOfId ? -1n : 1n);
    const invoices = finalized.filter((row) => row.kind === "PURCHASE_INVOICE");
    const payments = finalized.filter((row) => row.kind === "SUPPLIER_PAYMENT");
    const supplierReturns = finalized.filter((row) => row.kind === "SUPPLIER_RETURN");
    const issues = finalized.filter((row) => row.kind === "STOCK_ISSUE");
    const consumptionReturns = finalized.filter((row) => row.kind === "STOCK_RETURN");
    const invoiceAmount = (row: DocumentRow) =>
      sum((lineMap.get(row.id) ?? []).map((line) => BigInt(line.lineTotalToman)));
    const supplierCreditAmount = (row: DocumentRow) =>
      sum((lineMap.get(row.id) ?? []).map((line) => BigInt(line.supplierCreditToman ?? "0")));
    const procurement = sum(invoices.map((row) => signed(row) * invoiceAmount(row)));
    const supplierCredits = sum(
      supplierReturns.map((row) => signed(row) * supplierCreditAmount(row)),
    );
    const paid = sum(payments.map((row) => signed(row) * BigInt(row.totalToman)));
    const supplierProjectBalances = new Map<string, bigint>();
    const addBalance = (row: DocumentRow, amount: bigint) => {
      if (!row.supplierId) return;
      const key = `${row.projectId}:${row.supplierId}`;
      supplierProjectBalances.set(key, (supplierProjectBalances.get(key) ?? 0n) + amount);
    };
    for (const row of invoices) addBalance(row, signed(row) * invoiceAmount(row));
    for (const row of supplierReturns) addBalance(row, -signed(row) * supplierCreditAmount(row));
    for (const row of payments) addBalance(row, -signed(row) * BigInt(row.totalToman));
    const outstandingDebt = sum(
      [...supplierProjectBalances.values()].filter((amount) => amount > 0n),
    );
    const supplierAdvance = -sum(
      [...supplierProjectBalances.values()].filter((amount) => amount < 0n),
    );
    const consumed =
      sum(
        issues.flatMap((row) =>
          (lineMap.get(row.id) ?? []).map((line) => BigInt(line.carryingValueToman ?? "0")),
        ),
      ) -
      sum(
        consumptionReturns.flatMap((row) =>
          (lineMap.get(row.id) ?? []).map((line) => BigInt(line.carryingValueToman ?? "0")),
        ),
      );
    const valuationAdjustment = sum(
      supplierReturns.flatMap((row) =>
        (lineMap.get(row.id) ?? []).map((line) => BigInt(line.valuationAdjustmentToman ?? "0")),
      ),
    );
    const stockValue = sum(balances.map((row) => BigInt(row.carryingValueToman)));
    return {
      filters: filter,
      asOf: new Date().toISOString(),
      totals: {
        procurementToman: procurement.toString(),
        supplierCreditsToman: supplierCredits.toString(),
        paymentsToman: paid.toString(),
        outstandingDebtToman: outstandingDebt.toString(),
        supplierAdvanceToman: supplierAdvance.toString(),
        stockValueToman: stockValue.toString(),
        consumptionCostToman: consumed.toString(),
        valuationAdjustmentToman: valuationAdjustment.toString(),
      },
      pending: { count: visibleDocuments.filter((row) => row.status === "DRAFT").length },
      stock: balances.map((row) => ({
        ...row,
        projectName: projectNames.get(row.projectId) ?? "",
        materialName: materialNames.get(row.materialId) ?? "",
        averageUnitCostToman:
          parseStoredQuantity(row.quantity) > 0n
            ? roundHalfUp(
                BigInt(row.carryingValueToman) * 1000n,
                parseStoredQuantity(row.quantity),
              ).toString()
            : "0",
      })),
      entries: visibleDocuments.map((row) => ({
        ...row,
        projectName: projectNames.get(row.projectId) ?? "",
        destinationProjectName: row.destinationProjectId
          ? (projectNames.get(row.destinationProjectId) ?? "")
          : null,
        supplierName: row.supplierId ? (supplierNames.get(row.supplierId) ?? "") : null,
        lines: (lineMap.get(row.id) ?? []).map((line) => ({
          ...line,
          materialName: materialNames.get(line.materialId) ?? "",
        })),
      })),
      purchasesBySupplier: aggregateInvoices(
        invoices,
        lineMap,
        (row) => row.supplierId ?? "",
        supplierNames,
      ),
      purchasesByMaterial: aggregateInvoiceLines(invoices, lineMap, materialNames),
      consumptionTrend: aggregateConsumptionTrend(issues, consumptionReturns, lineMap),
      drillDownIds: finalized.map((row) => row.id),
      valuationOrderLabel:
        "ارزش موجودی بر پایه ترتیب ثبت سرور است؛ فیلتر تاریخ کاری ترتیب ارزش‌گذاری را تغییر نمی‌دهد.",
    };
  }

  private async applySyncCommand(principal: Principal, command: ProcurementSyncCommand) {
    if (command.commandType === "DOCUMENT_UPSERT") return this.writeDocument(principal, command);
    return this.writeMaterial(principal, command);
  }

  private async writeMaterial(
    principal: Principal,
    command: Extract<
      ProcurementSyncCommand,
      { commandType: "MATERIAL_UPSERT" | "MATERIAL_LIFECYCLE" }
    >,
  ) {
    return this.withReceipt(principal, command.commandId, command, async (tx) => {
      this.requireWorkspacePrincipal(principal);
      if (command.commandType === "MATERIAL_UPSERT") {
        const input = MaterialInputSchema.parse(command.input);
        if (command.expectedVersion === 0) {
          const [created] = await tx
            .insert(materials)
            .values({
              id: command.entityId,
              ...input,
              createdBy: principal.userId,
              updatedBy: principal.userId,
            })
            .returning();
          if (!created) throw new Error("Material insert returned no row");
          await this.record(tx, principal, "MATERIAL", created.id, "CREATE", null, created);
          return created;
        }
        const current = await this.lockMaterial(tx, command.entityId);
        if (current.version !== command.expectedVersion) throw staleVersion("material", current);
        const [updated] = await tx
          .update(materials)
          .set({
            ...input,
            version: current.version + 1,
            updatedBy: principal.userId,
            updatedAt: new Date(),
          })
          .where(eq(materials.id, current.id))
          .returning();
        if (!updated) throw new Error("Material update returned no row");
        await this.record(tx, principal, "MATERIAL", updated.id, "UPDATE", current, updated);
        return updated;
      }
      const current = await this.lockMaterial(tx, command.entityId);
      if (current.version !== command.expectedVersion) throw staleVersion("material", current);
      const archived = command.action === "ARCHIVE";
      if (current.archived === archived)
        throw new ConflictException({
          code: "INVALID_LIFECYCLE",
          message: "Material is already in that state",
        });
      const [updated] = await tx
        .update(materials)
        .set({
          archived,
          archiveReason: command.reason,
          version: current.version + 1,
          updatedBy: principal.userId,
          updatedAt: new Date(),
        })
        .where(eq(materials.id, current.id))
        .returning();
      if (!updated) throw new Error("Material lifecycle update returned no row");
      await this.record(
        tx,
        principal,
        "MATERIAL",
        updated.id,
        command.action,
        current,
        updated,
        command.reason,
      );
      return updated;
    });
  }

  private async writeDocument(
    principal: Principal,
    command: Extract<ProcurementSyncCommand, { commandType: "DOCUMENT_UPSERT" }>,
  ) {
    const input = ProcurementDocumentInputSchema.parse(command.input);
    return this.withReceipt(principal, command.commandId, command, async (tx) => {
      this.requireWorkspacePrincipal(principal);
      await this.requireProject(tx, input.projectId);
      if (input.kind === "STOCK_TRANSFER")
        await this.requireProject(tx, input.destinationProjectId);
      if ("supplierId" in input) await this.requireSupplier(tx, input.supplierId, false);
      const prepared = await this.prepareDocument(tx, command.entityId, input);
      if (command.expectedVersion === 0) {
        const [created] = await tx
          .insert(procurementDocuments)
          .values({
            ...prepared.document,
            id: command.entityId,
            createdBy: principal.userId,
            updatedBy: principal.userId,
          })
          .returning();
        if (!created) throw new Error("Procurement draft insert returned no row");
        if (prepared.lines.length) await tx.insert(procurementLines).values(prepared.lines);
        if (prepared.allocations.length)
          await tx.insert(supplierPaymentAllocations).values(prepared.allocations);
        await this.record(
          tx,
          principal,
          "PROCUREMENT_DOCUMENT",
          created.id,
          "CREATE",
          null,
          created,
        );
        return this.loadDocument(tx, created.id);
      }
      const current = await this.lockDocument(tx, command.entityId);
      this.expectDraftVersion(current, command.expectedVersion);
      if (current.kind !== input.kind || current.projectId !== input.projectId)
        throw new ConflictException({
          code: "REASSIGNMENT_NOT_ALLOWED",
          message: "A procurement draft cannot change kind or project",
        });
      await tx
        .delete(supplierPaymentAllocations)
        .where(eq(supplierPaymentAllocations.paymentDocumentId, current.id));
      await tx.delete(procurementLines).where(eq(procurementLines.documentId, current.id));
      const [updated] = await tx
        .update(procurementDocuments)
        .set({
          ...prepared.document,
          version: current.version + 1,
          updatedBy: principal.userId,
          updatedAt: new Date(),
        })
        .where(eq(procurementDocuments.id, current.id))
        .returning();
      if (!updated) throw new Error("Procurement draft update returned no row");
      if (prepared.lines.length) await tx.insert(procurementLines).values(prepared.lines);
      if (prepared.allocations.length)
        await tx.insert(supplierPaymentAllocations).values(prepared.allocations);
      await this.record(
        tx,
        principal,
        "PROCUREMENT_DOCUMENT",
        updated.id,
        "UPDATE",
        current,
        updated,
      );
      return this.loadDocument(tx, updated.id);
    });
  }

  private async prepareDocument(tx: Tx, documentId: string, input: ProcurementDocumentInput) {
    const base = {
      projectId: input.projectId,
      destinationProjectId: input.kind === "STOCK_TRANSFER" ? input.destinationProjectId : null,
      supplierId: "supplierId" in input ? input.supplierId : null,
      kind: input.kind,
      businessDate: input.businessDate,
      description: input.description,
      receiveAllNow: input.kind === "PURCHASE_INVOICE" && input.receiveAllNow,
      invoiceId: input.kind === "STOCK_RECEIPT" ? input.invoiceId : null,
      sourceDocumentId:
        input.kind === "STOCK_RETURN" || input.kind === "SUPPLIER_RETURN"
          ? input.sourceDocumentId
          : null,
      status: "DRAFT" as const,
    };
    const allocations =
      input.kind === "SUPPLIER_PAYMENT"
        ? input.allocations.map((allocation) => ({
            paymentDocumentId: documentId,
            invoiceDocumentId: allocation.invoiceId,
            amountToman: parseMoney(allocation.amountToman).toString(),
          }))
        : [];
    if (input.kind === "SUPPLIER_PAYMENT") {
      const allocated = sum(allocations.map((row) => BigInt(row.amountToman)));
      if (allocated > parseMoney(input.amountToman))
        throw new BadRequestException({
          code: "ALLOCATION_EXCEEDS_PAYMENT",
          message: "Payment allocations cannot exceed the payment amount",
        });
      return {
        document: { ...base, totalToman: parseMoney(input.amountToman).toString() },
        lines: [] as Array<typeof procurementLines.$inferInsert>,
        allocations,
      };
    }
    let lines: Array<typeof procurementLines.$inferInsert>;
    if (input.kind === "PURCHASE_INVOICE") {
      lines = input.lines.map((line) => ({
        id: line.id,
        documentId,
        materialId: line.materialId,
        quantity: formatQuantity(parseQuantity(line.quantity)),
        unitPriceToman: parseMoney(line.unitPriceToman).toString(),
        lineTotalToman: invoiceLineTotal(line.quantity, line.unitPriceToman).toString(),
      }));
    } else if (input.kind === "STOCK_RECEIPT") {
      const source = await this.sourceLines(
        tx,
        input.invoiceId,
        input.lines.map((line) => line.invoiceLineId),
      );
      lines = input.lines.map((line) => {
        const invoiceLine = source.get(line.invoiceLineId)!;
        return {
          id: line.id,
          documentId,
          materialId: invoiceLine.materialId,
          sourceLineId: invoiceLine.id,
          quantity: formatQuantity(parseQuantity(line.quantity)),
          unitPriceToman: invoiceLine.unitPriceToman,
          lineTotalToman: invoiceLineTotal(
            line.quantity,
            invoiceLine.unitPriceToman ?? "0",
          ).toString(),
        };
      });
    } else if (input.kind === "STOCK_RETURN" || input.kind === "SUPPLIER_RETURN") {
      const source = await this.sourceLines(
        tx,
        input.sourceDocumentId,
        input.lines.map((line) => line.sourceLineId),
      );
      lines = input.lines.map((line) => {
        const sourceLine = source.get(line.sourceLineId)!;
        return {
          id: line.id,
          documentId,
          materialId: sourceLine.materialId,
          sourceLineId: sourceLine.id,
          quantity: formatQuantity(parseQuantity(line.quantity)),
          unitPriceToman: sourceLine.unitPriceToman,
          lineTotalToman: "0",
        };
      });
    } else {
      lines = input.lines.map((line) => ({
        id: line.id,
        documentId,
        materialId: line.materialId,
        quantity: formatQuantity(parseQuantity(line.quantity)),
        lineTotalToman: "0",
      }));
    }
    const total =
      input.kind === "PURCHASE_INVOICE"
        ? sum(lines.map((line) => BigInt(line.lineTotalToman ?? "0")))
        : 0n;
    return { document: { ...base, totalToman: total.toString() }, lines, allocations };
  }

  private async validatePaymentAllocations(tx: Tx, payment: DocumentRow) {
    const allocations = await tx
      .select()
      .from(supplierPaymentAllocations)
      .where(eq(supplierPaymentAllocations.paymentDocumentId, payment.id));
    const invoiceIds = [...new Set(allocations.map((row) => row.invoiceDocumentId))].sort();
    for (const invoiceId of invoiceIds) {
      const invoice = await this.lockDocument(tx, invoiceId);
      if (
        invoice.kind !== "PURCHASE_INVOICE" ||
        invoice.status !== "FINALIZED" ||
        invoice.projectId !== payment.projectId ||
        invoice.supplierId !== payment.supplierId
      )
        throw new ConflictException({
          code: "INVALID_ALLOCATION_TARGET",
          message: "Allocations require a finalized invoice for the same supplier and project",
        });
      const used = await tx
        .select({ total: sql<string>`coalesce(sum(${supplierPaymentAllocations.amountToman}), 0)` })
        .from(supplierPaymentAllocations)
        .innerJoin(
          procurementDocuments,
          eq(procurementDocuments.id, supplierPaymentAllocations.paymentDocumentId),
        )
        .where(
          and(
            eq(supplierPaymentAllocations.invoiceDocumentId, invoiceId),
            eq(procurementDocuments.status, "FINALIZED"),
            ne(procurementDocuments.id, payment.id),
          ),
        );
      const requested = allocations.find((row) => row.invoiceDocumentId === invoiceId)!;
      if (
        BigInt(used[0]?.total ?? "0") + BigInt(requested.amountToman) >
        BigInt(invoice.totalToman)
      )
        throw new ConflictException({
          code: "ALLOCATION_EXCEEDS_OUTSTANDING",
          message: "Allocation exceeds the invoice outstanding balance",
        });
    }
  }

  private async validateReceipt(tx: Tx, receipt: DocumentRow, lines: LineRow[]) {
    if (!receipt.invoiceId)
      throw new ConflictException({
        code: "INVOICE_REQUIRED",
        message: "Receipt must reference an invoice",
      });
    const invoice = await this.lockDocument(tx, receipt.invoiceId);
    if (
      invoice.kind !== "PURCHASE_INVOICE" ||
      invoice.status !== "FINALIZED" ||
      invoice.projectId !== receipt.projectId ||
      invoice.supplierId !== receipt.supplierId
    )
      throw new ConflictException({
        code: "INVALID_RECEIPT_INVOICE",
        message: "Receipt must reference a finalized invoice for the same supplier and project",
      });
    this.requireUniqueSourceLines(lines);
    for (const line of lines) {
      if (!line.sourceLineId)
        throw new ConflictException({
          code: "INVOICE_LINE_REQUIRED",
          message: "Receipt line source is missing",
        });
      const [source] = await tx
        .select()
        .from(procurementLines)
        .where(eq(procurementLines.id, line.sourceLineId))
        .limit(1)
        .for("update");
      if (!source || source.documentId !== invoice.id)
        throw new ConflictException({
          code: "INVALID_INVOICE_LINE",
          message: "Receipt line does not belong to its invoice",
        });
      const received = await this.finalizedLinkedQuantity(
        tx,
        "STOCK_RECEIPT",
        source.id,
        receipt.id,
      );
      if (received + parseStoredQuantity(line.quantity) > parseStoredQuantity(source.quantity))
        throw new ConflictException({
          code: "RECEIPT_EXCEEDS_INVOICE",
          message: "Received quantity exceeds the invoice line outstanding quantity",
        });
    }
  }

  private requireUniqueSourceLines(lines: LineRow[]) {
    const sourceLineIds = new Set<string>();
    for (const line of lines) {
      if (!line.sourceLineId) continue;
      if (sourceLineIds.has(line.sourceLineId))
        throw new ConflictException({
          code: "DUPLICATE_SOURCE_LINE",
          message: "A source line can be referenced only once per document",
        });
      sourceLineIds.add(line.sourceLineId);
    }
  }

  private async postReceipt(tx: Tx, document: DocumentRow, lines: LineRow[]) {
    const balances = await this.lockBalances(
      tx,
      lines.map((line) => ({ projectId: document.projectId, materialId: line.materialId })),
    );
    for (const line of lines) {
      const quantity = parseStoredQuantity(line.quantity);
      const [source] = await tx
        .select()
        .from(procurementLines)
        .where(eq(procurementLines.id, line.sourceLineId!))
        .limit(1)
        .for("update");
      if (!source) throw new Error("Receipt source line disappeared");
      const receivedQuantity = await this.finalizedLinkedQuantity(
        tx,
        "STOCK_RECEIPT",
        source.id,
        document.id,
      );
      const receivedValue = await this.finalizedLinkedValue(
        tx,
        "STOCK_RECEIPT",
        source.id,
        document.id,
        "carrying",
      );
      const value = proportionalValue(
        quantity,
        parseStoredQuantity(source.quantity) - receivedQuantity,
        BigInt(source.lineTotalToman) - receivedValue,
      );
      const balance = balances.get(balanceKey(document.projectId, line.materialId))!;
      const updated = await this.setBalance(
        tx,
        balance,
        parseStoredQuantity(balance.quantity) + quantity,
        BigInt(balance.carryingValueToman) + value,
      );
      balances.set(balanceKey(document.projectId, line.materialId), updated);
      await tx
        .update(procurementLines)
        .set({ lineTotalToman: value.toString(), carryingValueToman: value.toString() })
        .where(eq(procurementLines.id, line.id));
      await tx.insert(stockMovements).values({
        documentId: document.id,
        lineId: line.id,
        projectId: document.projectId,
        materialId: line.materialId,
        quantityDelta: formatQuantity(quantity),
        valueDeltaToman: value.toString(),
      });
    }
  }

  private async postIssue(tx: Tx, document: DocumentRow, lines: LineRow[]) {
    const balances = await this.lockBalances(
      tx,
      lines.map((line) => ({ projectId: document.projectId, materialId: line.materialId })),
    );
    for (const line of lines) {
      const quantity = parseStoredQuantity(line.quantity);
      const balance = balances.get(balanceKey(document.projectId, line.materialId))!;
      const currentQuantity = parseStoredQuantity(balance.quantity);
      const value = proportionalValue(
        quantity,
        currentQuantity,
        BigInt(balance.carryingValueToman),
      );
      const updated = await this.setBalance(
        tx,
        balance,
        currentQuantity - quantity,
        BigInt(balance.carryingValueToman) - value,
      );
      balances.set(balanceKey(document.projectId, line.materialId), updated);
      await tx
        .update(procurementLines)
        .set({ carryingValueToman: value.toString(), lineTotalToman: value.toString() })
        .where(eq(procurementLines.id, line.id));
      await tx.insert(stockMovements).values({
        documentId: document.id,
        lineId: line.id,
        projectId: document.projectId,
        materialId: line.materialId,
        quantityDelta: formatQuantity(-quantity),
        valueDeltaToman: (-value).toString(),
      });
    }
  }

  private async postTransfer(tx: Tx, document: DocumentRow, lines: LineRow[]) {
    if (!document.destinationProjectId) throw new Error("Transfer destination is missing");
    const keys = lines.flatMap((line) => [
      { projectId: document.projectId, materialId: line.materialId },
      { projectId: document.destinationProjectId!, materialId: line.materialId },
    ]);
    const balances = await this.lockBalances(tx, keys);
    for (const line of lines) {
      const quantity = parseStoredQuantity(line.quantity);
      const sourceKey = balanceKey(document.projectId, line.materialId);
      const destinationKey = balanceKey(document.destinationProjectId, line.materialId);
      const source = balances.get(sourceKey)!;
      const destination = balances.get(destinationKey)!;
      const value = proportionalValue(
        quantity,
        parseStoredQuantity(source.quantity),
        BigInt(source.carryingValueToman),
      );
      balances.set(
        sourceKey,
        await this.setBalance(
          tx,
          source,
          parseStoredQuantity(source.quantity) - quantity,
          BigInt(source.carryingValueToman) - value,
        ),
      );
      balances.set(
        destinationKey,
        await this.setBalance(
          tx,
          destination,
          parseStoredQuantity(destination.quantity) + quantity,
          BigInt(destination.carryingValueToman) + value,
        ),
      );
      await tx
        .update(procurementLines)
        .set({ carryingValueToman: value.toString(), lineTotalToman: value.toString() })
        .where(eq(procurementLines.id, line.id));
      const pairId = randomUUID();
      await tx.insert(stockMovements).values([
        {
          documentId: document.id,
          lineId: line.id,
          projectId: document.projectId,
          materialId: line.materialId,
          quantityDelta: formatQuantity(-quantity),
          valueDeltaToman: (-value).toString(),
          pairedTransferId: pairId,
        },
        {
          documentId: document.id,
          lineId: line.id,
          projectId: document.destinationProjectId,
          materialId: line.materialId,
          quantityDelta: formatQuantity(quantity),
          valueDeltaToman: value.toString(),
          pairedTransferId: pairId,
        },
      ]);
    }
  }

  private async postConsumptionReturn(tx: Tx, document: DocumentRow, lines: LineRow[]) {
    this.requireUniqueSourceLines(lines);
    const balances = await this.lockBalances(
      tx,
      lines.map((line) => ({ projectId: document.projectId, materialId: line.materialId })),
    );
    for (const line of lines) {
      const source = await this.requireSourceLine(
        tx,
        line,
        document.sourceDocumentId,
        "STOCK_ISSUE",
        document,
      );
      const returnedQuantity = await this.finalizedLinkedQuantity(
        tx,
        "STOCK_RETURN",
        source.id,
        document.id,
      );
      const returnedValue = await this.finalizedLinkedValue(
        tx,
        "STOCK_RETURN",
        source.id,
        document.id,
        "carrying",
      );
      const remainingQuantity = parseStoredQuantity(source.quantity) - returnedQuantity;
      const quantity = parseStoredQuantity(line.quantity);
      const remainingValue = BigInt(source.carryingValueToman ?? "0") - returnedValue;
      const value = proportionalValue(quantity, remainingQuantity, remainingValue);
      const key = balanceKey(document.projectId, line.materialId);
      const balance = balances.get(key)!;
      balances.set(
        key,
        await this.setBalance(
          tx,
          balance,
          parseStoredQuantity(balance.quantity) + quantity,
          BigInt(balance.carryingValueToman) + value,
        ),
      );
      await tx
        .update(procurementLines)
        .set({ carryingValueToman: value.toString(), lineTotalToman: value.toString() })
        .where(eq(procurementLines.id, line.id));
      await tx.insert(stockMovements).values({
        documentId: document.id,
        lineId: line.id,
        projectId: document.projectId,
        materialId: line.materialId,
        quantityDelta: formatQuantity(quantity),
        valueDeltaToman: value.toString(),
      });
    }
  }

  private async postSupplierReturn(tx: Tx, document: DocumentRow, lines: LineRow[]) {
    this.requireUniqueSourceLines(lines);
    const balances = await this.lockBalances(
      tx,
      lines.map((line) => ({ projectId: document.projectId, materialId: line.materialId })),
    );
    let totalCredit = 0n;
    for (const line of lines) {
      const source = await this.requireSourceLine(
        tx,
        line,
        document.sourceDocumentId,
        "STOCK_RECEIPT",
        document,
      );
      const returnedQuantity = await this.finalizedLinkedQuantity(
        tx,
        "SUPPLIER_RETURN",
        source.id,
        document.id,
      );
      const returnedCredit = await this.finalizedLinkedValue(
        tx,
        "SUPPLIER_RETURN",
        source.id,
        document.id,
        "supplierCredit",
      );
      const remainingSourceQuantity = parseStoredQuantity(source.quantity) - returnedQuantity;
      const quantity = parseStoredQuantity(line.quantity);
      if (quantity > remainingSourceQuantity)
        throw new ConflictException({
          code: "RETURN_EXCEEDS_RECEIPT",
          message: "Supplier return exceeds the received quantity",
        });
      const key = balanceKey(document.projectId, line.materialId);
      const balance = balances.get(key)!;
      const carrying = proportionalValue(
        quantity,
        parseStoredQuantity(balance.quantity),
        BigInt(balance.carryingValueToman),
      );
      const credit = proportionalValue(
        quantity,
        remainingSourceQuantity,
        BigInt(source.lineTotalToman) - returnedCredit,
      );
      const adjustment = carrying - credit;
      totalCredit += credit;
      balances.set(
        key,
        await this.setBalance(
          tx,
          balance,
          parseStoredQuantity(balance.quantity) - quantity,
          BigInt(balance.carryingValueToman) - carrying,
        ),
      );
      await tx
        .update(procurementLines)
        .set({
          lineTotalToman: credit.toString(),
          carryingValueToman: carrying.toString(),
          supplierCreditToman: credit.toString(),
          valuationAdjustmentToman: adjustment.toString(),
        })
        .where(eq(procurementLines.id, line.id));
      await tx.insert(stockMovements).values({
        documentId: document.id,
        lineId: line.id,
        projectId: document.projectId,
        materialId: line.materialId,
        quantityDelta: formatQuantity(-quantity),
        valueDeltaToman: (-carrying).toString(),
      });
    }
    await tx
      .update(procurementDocuments)
      .set({ totalToman: totalCredit.toString() })
      .where(eq(procurementDocuments.id, document.id));
  }

  private async createReceiveAllReceipt(
    tx: Tx,
    principal: Principal,
    invoice: DocumentRow,
    invoiceLines: LineRow[],
  ) {
    const receiptId = randomUUID();
    const [receipt] = await tx
      .insert(procurementDocuments)
      .values({
        id: receiptId,
        projectId: invoice.projectId,
        supplierId: invoice.supplierId,
        kind: "STOCK_RECEIPT",
        businessDate: invoice.businessDate,
        description: `رسید هم‌زمان مرتبط با فاکتور ${invoice.id}`,
        status: "DRAFT",
        totalToman: invoice.totalToman,
        invoiceId: invoice.id,
        createdBy: principal.userId,
        updatedBy: principal.userId,
      })
      .returning();
    if (!receipt) throw new Error("Linked receipt insert returned no row");
    const receiptLines = invoiceLines.map((line) => ({
      id: randomUUID(),
      documentId: receipt.id,
      materialId: line.materialId,
      sourceLineId: line.id,
      quantity: line.quantity,
      unitPriceToman: line.unitPriceToman,
      lineTotalToman: line.lineTotalToman,
    }));
    const inserted = await tx.insert(procurementLines).values(receiptLines).returning();
    await this.postReceipt(tx, receipt, inserted);
    const finalized = await this.markFinalized(tx, principal, receipt);
    await this.record(
      tx,
      principal,
      "PROCUREMENT_DOCUMENT",
      receipt.id,
      "FINALIZE_LINKED_RECEIPT",
      null,
      finalized,
    );
    return finalized;
  }

  private async lockBalances(tx: Tx, keys: Array<{ projectId: string; materialId: string }>) {
    const unique = [
      ...new Map(keys.map((key) => [balanceKey(key.projectId, key.materialId), key])).values(),
    ].sort((a, b) =>
      balanceKey(a.projectId, a.materialId).localeCompare(balanceKey(b.projectId, b.materialId)),
    );
    const balances = new Map<string, BalanceRow>();
    for (const key of unique) {
      await tx
        .insert(stockBalances)
        .values({ ...key })
        .onConflictDoNothing({ target: [stockBalances.projectId, stockBalances.materialId] });
      const [row] = await tx
        .select()
        .from(stockBalances)
        .where(
          and(
            eq(stockBalances.projectId, key.projectId),
            eq(stockBalances.materialId, key.materialId),
          ),
        )
        .limit(1)
        .for("update");
      if (!row) throw new Error("Stock balance lock returned no row");
      balances.set(balanceKey(key.projectId, key.materialId), row);
    }
    return balances;
  }

  private async setBalance(tx: Tx, current: BalanceRow, quantity: bigint, value: bigint) {
    if (quantity < 0n || value < 0n)
      throw new ConflictException({
        code: "INSUFFICIENT_STOCK",
        message: "Stock cannot become negative",
      });
    const normalizedValue = quantity === 0n ? 0n : value;
    const [updated] = await tx
      .update(stockBalances)
      .set({
        quantity: formatQuantity(quantity),
        carryingValueToman: normalizedValue.toString(),
        version: current.version + 1,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(stockBalances.projectId, current.projectId),
          eq(stockBalances.materialId, current.materialId),
        ),
      )
      .returning();
    if (!updated) throw new Error("Stock balance update returned no row");
    return updated;
  }

  private async finalizedLinkedQuantity(
    tx: Tx,
    kind: DocumentRow["kind"],
    sourceLineId: string,
    excludingId: string,
  ) {
    const rows = await tx
      .select({ quantity: procurementLines.quantity })
      .from(procurementLines)
      .innerJoin(procurementDocuments, eq(procurementDocuments.id, procurementLines.documentId))
      .where(
        and(
          eq(procurementLines.sourceLineId, sourceLineId),
          eq(procurementDocuments.kind, kind),
          eq(procurementDocuments.status, "FINALIZED"),
          ne(procurementDocuments.id, excludingId),
        ),
      );
    return sum(rows.map((row) => parseStoredQuantity(row.quantity)));
  }

  private async finalizedLinkedValue(
    tx: Tx,
    kind: DocumentRow["kind"],
    sourceLineId: string,
    excludingId: string,
    value: "carrying" | "supplierCredit",
  ) {
    const amountColumn =
      value === "carrying"
        ? procurementLines.carryingValueToman
        : procurementLines.supplierCreditToman;
    const rows = await tx
      .select({ amount: amountColumn })
      .from(procurementLines)
      .innerJoin(procurementDocuments, eq(procurementDocuments.id, procurementLines.documentId))
      .where(
        and(
          eq(procurementLines.sourceLineId, sourceLineId),
          eq(procurementDocuments.kind, kind),
          eq(procurementDocuments.status, "FINALIZED"),
          ne(procurementDocuments.id, excludingId),
        ),
      );
    return sum(rows.map((row) => BigInt(row.amount ?? "0")));
  }

  private async requireSourceLine(
    tx: Tx,
    line: LineRow,
    sourceDocumentId: string | null,
    expectedKind: DocumentRow["kind"],
    returnDocument: DocumentRow,
  ) {
    if (!line.sourceLineId || !sourceDocumentId)
      throw new ConflictException({ code: "SOURCE_REQUIRED", message: "Return source is missing" });
    const [source] = await tx
      .select()
      .from(procurementLines)
      .where(eq(procurementLines.id, line.sourceLineId))
      .limit(1)
      .for("update");
    const sourceDocument = source ? await this.lockDocument(tx, source.documentId) : undefined;
    if (
      !source ||
      !sourceDocument ||
      source.documentId !== sourceDocumentId ||
      sourceDocument.kind !== expectedKind ||
      sourceDocument.status !== "FINALIZED" ||
      sourceDocument.projectId !== returnDocument.projectId ||
      sourceDocument.supplierId !== returnDocument.supplierId
    )
      throw new ConflictException({
        code: "INVALID_RETURN_SOURCE",
        message: "Return must reference a finalized source line",
      });
    return source;
  }

  private async invoiceDependencies(tx: Tx, invoiceId: string) {
    const [allocations, receipts] = await Promise.all([
      tx
        .select({ id: supplierPaymentAllocations.paymentDocumentId })
        .from(supplierPaymentAllocations)
        .where(eq(supplierPaymentAllocations.invoiceDocumentId, invoiceId)),
      tx
        .select({ id: procurementDocuments.id })
        .from(procurementDocuments)
        .where(
          and(
            eq(procurementDocuments.invoiceId, invoiceId),
            ne(procurementDocuments.status, "REVERSED"),
          ),
        ),
    ]);
    return [
      ...allocations.map((row) => `payment:${row.id}`),
      ...receipts.map((row) => `receipt:${row.id}`),
    ];
  }

  private async sourceLines(tx: Tx, documentId: string, ids: string[]) {
    const document = await this.lockDocument(tx, documentId);
    const rows = ids.length
      ? await tx.select().from(procurementLines).where(inArray(procurementLines.id, ids))
      : [];
    const map = new Map(
      rows.filter((row) => row.documentId === document.id).map((row) => [row.id, row]),
    );
    if (map.size !== new Set(ids).size)
      throw new BadRequestException({
        code: "SOURCE_LINE_NOT_FOUND",
        message: "A referenced source line was not found",
      });
    return map;
  }

  private async loadDocument(tx: Tx, id: string) {
    const [document] = await tx
      .select()
      .from(procurementDocuments)
      .where(eq(procurementDocuments.id, id))
      .limit(1);
    if (!document) throw new Error("Procurement document disappeared");
    const [lines, allocations] = await Promise.all([
      tx
        .select()
        .from(procurementLines)
        .where(eq(procurementLines.documentId, id))
        .orderBy(asc(procurementLines.id)),
      tx
        .select()
        .from(supplierPaymentAllocations)
        .where(eq(supplierPaymentAllocations.paymentDocumentId, id)),
    ]);
    return { ...document, lines, allocations };
  }

  private async markFinalized(tx: Tx, principal: Principal, document: DocumentRow) {
    const [updated] = await tx
      .update(procurementDocuments)
      .set({
        status: "FINALIZED",
        version: document.version + 1,
        finalizedBy: principal.userId,
        finalizedAt: new Date(),
        updatedBy: principal.userId,
        updatedAt: new Date(),
      })
      .where(eq(procurementDocuments.id, document.id))
      .returning();
    if (!updated) throw new Error("Procurement finalization returned no row");
    return updated;
  }

  private async requireProject(tx: Tx, id: string) {
    const [project] = await tx.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project)
      throw new NotFoundException({ code: "PROJECT_NOT_FOUND", message: "Project was not found" });
    return project;
  }

  private async requireActiveProject(tx: Tx, id: string) {
    const [project] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1)
      .for("update");
    if (!project)
      throw new NotFoundException({ code: "PROJECT_NOT_FOUND", message: "Project was not found" });
    if (project.lifecycle !== "ACTIVE")
      throw new ConflictException({
        code: "PROJECT_ARCHIVED",
        message: "Archived projects cannot receive procurement postings",
      });
    return project;
  }

  private async requireSupplier(tx: Tx, id: string, lock: boolean) {
    const query = tx.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    const [supplier] = lock ? await query.for("update") : await query;
    if (!supplier || !supplier.isSupplier)
      throw new NotFoundException({
        code: "SUPPLIER_NOT_FOUND",
        message: "Supplier was not found",
      });
    if (lock && supplier.archived)
      throw new ConflictException({
        code: "SUPPLIER_ARCHIVED",
        message: "Archived suppliers cannot receive new postings",
      });
    return supplier;
  }

  private async requireActiveMaterials(tx: Tx, ids: string[]) {
    for (const id of ids) {
      const material = await this.lockMaterial(tx, id);
      if (material.archived)
        throw new ConflictException({
          code: "MATERIAL_ARCHIVED",
          message: "Archived materials cannot receive new postings",
        });
    }
  }

  private async lockMaterial(tx: Tx, id: string) {
    const [material] = await tx
      .select()
      .from(materials)
      .where(eq(materials.id, id))
      .limit(1)
      .for("update");
    if (!material)
      throw new NotFoundException({
        code: "MATERIAL_NOT_FOUND",
        message: "Material was not found",
      });
    return material;
  }

  private async lockDocument(tx: Tx, id: string) {
    const [document] = await tx
      .select()
      .from(procurementDocuments)
      .where(eq(procurementDocuments.id, id))
      .limit(1)
      .for("update");
    if (!document)
      throw new NotFoundException({
        code: "PROCUREMENT_RECORD_NOT_FOUND",
        message: "Procurement record was not found",
      });
    return document;
  }

  private expectDraftVersion(document: DocumentRow, version: number) {
    if (document.version !== version) throw staleVersion("procurement draft", document);
    if (document.status !== "DRAFT")
      throw new ConflictException({
        code: "DRAFT_LOCKED",
        message: "Finalized procurement records cannot be edited",
      });
  }

  private requireWorkspacePrincipal(principal: Principal) {
    if (principal.kind !== "workspace") throw new ForbiddenException();
  }

  private async record(
    tx: Tx,
    actor: Principal,
    entityType: string,
    entityId: string,
    action: string,
    before: unknown,
    after: unknown,
    reason?: string,
  ) {
    await tx.insert(businessAudit).values({
      actorUserId: actor.userId,
      actorSessionId: actor.sessionId,
      entityType,
      entityId,
      action,
      reason,
      beforeValue: before,
      afterValue: after,
    });
    const [next] = await tx
      .update(syncRevision)
      .set({ revision: sql`${syncRevision.revision} + 1` })
      .where(eq(syncRevision.singleton, 1))
      .returning();
    if (!next) throw new Error("Sync revision row is missing");
    await tx.insert(syncChanges).values({
      revision: next.revision,
      entityType,
      entityId,
      snapshot: after,
      actorUserId: actor.userId,
    });
  }

  private async withReceipt<T>(
    principal: Principal,
    commandId: string,
    body: unknown,
    operation: (tx: Tx) => Promise<T>,
  ): Promise<T | { result: T; replayed: true }> {
    const bodyHash = createHash("sha256").update(canonicalJson(body)).digest("hex");
    return this.db.transaction(async (tx) => {
      await requireLiveSession(tx, claimsFor(principal), false, "share");
      const [claimed] = await tx
        .insert(procurementReceipts)
        .values({ userId: principal.userId, commandId, bodyHash, result: {} })
        .onConflictDoNothing({
          target: [procurementReceipts.userId, procurementReceipts.commandId],
        })
        .returning({ commandId: procurementReceipts.commandId });
      if (!claimed) {
        const [receipt] = await tx
          .select()
          .from(procurementReceipts)
          .where(
            and(
              eq(procurementReceipts.userId, principal.userId),
              eq(procurementReceipts.commandId, commandId),
            ),
          )
          .limit(1);
        if (!receipt) throw new Error("Procurement command receipt is missing");
        if (receipt.bodyHash !== bodyHash)
          throw new ConflictException({
            code: "COMMAND_ID_CONFLICT",
            message: "Command ID was used with different content",
          });
        return { result: receipt.result as T, replayed: true };
      }
      const result = await operation(tx);
      await tx
        .update(procurementReceipts)
        .set({ result })
        .where(
          and(
            eq(procurementReceipts.userId, principal.userId),
            eq(procurementReceipts.commandId, commandId),
          ),
        );
      return result;
    });
  }
}

function balanceKey(projectId: string, materialId: string) {
  return `${projectId}:${materialId}`;
}

function staleVersion(label: string, current: { version: number }) {
  return new ConflictException({
    code: "STALE_VERSION",
    message: `This ${label} changed`,
    currentVersion: current.version,
    current,
  });
}

function sum(values: bigint[]) {
  return values.reduce((total, value) => total + value, 0n);
}

function aggregateInvoices(
  invoices: DocumentRow[],
  lines: Map<string, LineRow[]>,
  key: (row: DocumentRow) => string,
  names: Map<string, string>,
) {
  const rows = new Map<
    string,
    { id: string; name: string; amountToman: bigint; sourceIds: string[] }
  >();
  for (const invoice of invoices) {
    const id = key(invoice);
    const row = rows.get(id) ?? { id, name: names.get(id) ?? "", amountToman: 0n, sourceIds: [] };
    row.amountToman +=
      (invoice.reversalOfId ? -1n : 1n) *
      sum((lines.get(invoice.id) ?? []).map((line) => BigInt(line.lineTotalToman)));
    row.sourceIds.push(invoice.id);
    rows.set(id, row);
  }
  return [...rows.values()].map((row) => ({
    ...row,
    amountToman: row.amountToman.toString(),
    lineCount: row.sourceIds.flatMap((id) => lines.get(id) ?? []).length,
  }));
}

function aggregateInvoiceLines(
  invoices: DocumentRow[],
  lines: Map<string, LineRow[]>,
  names: Map<string, string>,
) {
  const rows = new Map<
    string,
    {
      materialId: string;
      materialName: string;
      quantity: bigint;
      amount: bigint;
      sourceIds: string[];
    }
  >();
  for (const invoice of invoices) {
    const sign = invoice.reversalOfId ? -1n : 1n;
    for (const line of lines.get(invoice.id) ?? []) {
      const row = rows.get(line.materialId) ?? {
        materialId: line.materialId,
        materialName: names.get(line.materialId) ?? "",
        quantity: 0n,
        amount: 0n,
        sourceIds: [],
      };
      row.quantity += sign * parseStoredQuantity(line.quantity);
      row.amount += sign * BigInt(line.lineTotalToman);
      row.sourceIds.push(invoice.id);
      rows.set(line.materialId, row);
    }
  }
  return [...rows.values()].map(({ quantity, amount, ...row }) => ({
    ...row,
    quantity: formatQuantity(quantity),
    amountToman: amount.toString(),
  }));
}

function aggregateConsumptionTrend(
  issues: DocumentRow[],
  returns: DocumentRow[],
  lines: Map<string, LineRow[]>,
) {
  const rows = new Map<string, { businessDate: string; cost: bigint; sourceIds: string[] }>();
  for (const [documents, sign] of [
    [issues, 1n],
    [returns, -1n],
  ] as const) {
    for (const document of documents) {
      const row = rows.get(document.businessDate) ?? {
        businessDate: document.businessDate,
        cost: 0n,
        sourceIds: [],
      };
      row.cost +=
        sign *
        sum((lines.get(document.id) ?? []).map((line) => BigInt(line.carryingValueToman ?? "0")));
      row.sourceIds.push(document.id);
      rows.set(document.businessDate, row);
    }
  }
  return [...rows.values()]
    .sort((a, b) => a.businessDate.localeCompare(b.businessDate))
    .map(({ cost, ...row }) => ({ ...row, costToman: cost.toString() }));
}

function statusOf(error: unknown): number {
  if (error instanceof ZodError || error instanceof BadRequestException) return 400;
  if (error instanceof ConflictException) return 409;
  if (error instanceof NotFoundException) return 404;
  if (error instanceof ForbiddenException) return 403;
  return 500;
}

function problemOf(error: unknown) {
  if (error instanceof ZodError)
    return {
      code: "INVALID_PROCUREMENT_DRAFT",
      message: "Procurement draft is invalid",
      fieldErrors: Object.fromEntries(
        error.issues.map((issue) => [issue.path.join("."), issue.message]),
      ),
    };
  if (
    error &&
    typeof error === "object" &&
    "getResponse" in error &&
    typeof error.getResponse === "function"
  )
    return error.getResponse();
  return {
    code: "PROCUREMENT_COMMAND_FAILED",
    message: "Procurement command could not be synchronized",
  };
}
