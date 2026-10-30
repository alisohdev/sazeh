import { createHash, randomUUID } from "node:crypto";
import {
  Inject,
  Injectable,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import {
  FinanceDecisionSchema,
  FinanceDraftSchema,
  FinanceActionSchema,
  FinanceReverseSchema,
  type FinanceDraft,
  type FinanceAction,
  type FinanceReverse,
} from "@sazeh/contracts";
import { and, eq } from "drizzle-orm";
import { DATABASE, type Database } from "../db/database.module.js";
import {
  attachments,
  financeRecords,
  financeReceipts,
  projects,
  contacts,
  businessAudit,
} from "../db/schema.js";
import { claimsFor, requireLiveSession, type Principal } from "../identity/identity.service.js";
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Row = typeof financeRecords.$inferSelect;
const canonicalJson = (v: unknown): string =>
  Array.isArray(v)
    ? "[" + v.map(canonicalJson).join(",") + "]"
    : v && typeof v === "object"
      ? "{" +
        Object.keys(v)
          .sort()
          .map((k) => JSON.stringify(k) + ":" + canonicalJson((v as Record<string, unknown>)[k]))
          .join(",") +
        "}"
      : JSON.stringify(v);
@Injectable()
export class FinanceService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  async save(actor: Principal, raw: FinanceDraft) {
    const c = FinanceDraftSchema.parse(raw);
    return this.withReceipt(actor, c.commandId, c, async (tx) => {
      if (actor.kind !== "workspace") throw new ForbiddenException();
      await this.project(tx, c.input.projectId);
      if (c.input.contactId) {
        const [contact] = await tx
          .select()
          .from(contacts)
          .where(eq(contacts.id, c.input.contactId))
          .for("share");
        if (!contact || contact.archived) throw new ConflictException("Contact unavailable");
      }
      let before: Row | null = null;
      if (c.expectedVersion) {
        before = await this.lock(tx, c.recordId);
        this.version(before, c.expectedVersion, "DRAFT");
        if (before.projectId !== c.input.projectId)
          throw new ConflictException("Cannot move project");
      }
      const fields = { ...c.input, updatedBy: actor.userId, updatedAt: new Date() };
      const [row] = before
        ? await tx
            .update(financeRecords)
            .set({ ...fields, version: before.version + 1 })
            .where(eq(financeRecords.id, c.recordId))
            .returning()
        : await tx
            .insert(financeRecords)
            .values({ ...fields, id: c.recordId, createdBy: actor.userId })
            .returning();
      if (!row) throw new Error("Missing record");
      await this.record(tx, actor, before ? "UPDATE" : "CREATE", before, row);
      return row;
    });
  }
  async finalize(actor: Principal, raw: FinanceAction) {
    const c = FinanceActionSchema.parse(raw);
    return this.withReceipt(actor, c.commandId, c, async (tx) => {
      if (actor.kind !== "workspace") throw new ForbiddenException();
      // Project lock serializes dependency posting and reversal in a consistent order.
      const [peek] = await tx
        .select()
        .from(financeRecords)
        .where(eq(financeRecords.id, c.recordId));
      if (!peek) throw new NotFoundException();
      await this.project(tx, peek.projectId);
      const row = await this.lock(tx, c.recordId);
      this.version(row, c.expectedVersion, "DRAFT");
      const files = await tx.select().from(attachments).where(eq(attachments.recordId, row.id));
      if (files.some((f) => f.state !== "READY") && !c.acknowledgePendingEvidence)
        throw new ConflictException({
          code: "PENDING_EVIDENCE",
          message: "Explicit pending evidence acknowledgement required",
        });
      let supplierBilled = false;
      if (row.contactId) {
        const [contact] = await tx
          .select()
          .from(contacts)
          .where(eq(contacts.id, row.contactId))
          .for("share");
        if (!contact || contact.archived) throw new ConflictException("Contact unavailable");
        supplierBilled = contact.isSupplier;
      }
      if (row.sourceId) {
        const source = await this.lock(tx, row.sourceId);
        supplierBilled = source.supplierBilled;
        if (
          source.kind !== "EXPENSE" ||
          source.status !== "FINALIZED" ||
          source.reversalOfId ||
          source.projectId !== row.projectId ||
          source.contactId !== row.contactId
        )
          throw new ConflictException("Invalid expense dependency");
      }
      const [posted] = await tx
        .update(financeRecords)
        .set({
          supplierBilled,
          status: row.kind === "OWNER_CLAIM" ? "SUBMITTED" : "FINALIZED",
          version: row.version + 1,
          finalizedBy: actor.userId,
          finalizedAt: new Date(),
          updatedBy: actor.userId,
          updatedAt: new Date(),
        })
        .where(eq(financeRecords.id, row.id))
        .returning();
      if (!posted) throw new Error("Missing record");
      await this.record(tx, actor, "FINALIZE", row, posted);
      return posted;
    });
  }
  async decision(actor: Principal, raw: unknown) {
    const c = FinanceDecisionSchema.parse(raw);
    return this.withReceipt(actor, c.commandId, c, async (tx) => {
      if (actor.kind !== "workspace") throw new ForbiddenException();
      const [peek] = await tx
        .select()
        .from(financeRecords)
        .where(eq(financeRecords.id, c.recordId));
      if (!peek) throw new NotFoundException();
      await this.project(tx, peek.projectId);
      const row = await this.lock(tx, c.recordId);
      this.version(row, c.expectedVersion, "SUBMITTED");
      if (row.kind !== "OWNER_CLAIM" || BigInt(c.approvedToman) > BigInt(row.amountToman))
        throw new ConflictException("Invalid approved amount");
      const [result] = await tx
        .update(financeRecords)
        .set({
          status: c.approvedToman === "0" ? "REJECTED" : "FINALIZED",
          approvedToman: c.approvedToman,
          decisionNote: c.note,
          version: row.version + 1,
          updatedBy: actor.userId,
          finalizedBy: actor.userId,
          finalizedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(financeRecords.id, row.id))
        .returning();
      if (!result) throw new Error("Missing decision");
      await this.record(tx, actor, "DECISION", row, result, c.note);
      return result;
    });
  }
  async reverse(actor: Principal, raw: FinanceReverse) {
    const c = FinanceReverseSchema.parse(raw);
    return this.withReceipt(actor, c.commandId, c, async (tx) => {
      if (actor.kind !== "workspace") throw new ForbiddenException();
      const [peek] = await tx
        .select()
        .from(financeRecords)
        .where(eq(financeRecords.id, c.recordId));
      if (!peek) throw new NotFoundException();
      await this.project(tx, peek.projectId);
      const row = await this.lock(tx, c.recordId);
      this.version(row, c.expectedVersion, "FINALIZED");
      if (row.reversalOfId) throw new ConflictException("Cannot reverse reversal");
      const dependencies = await tx
        .select()
        .from(financeRecords)
        .where(and(eq(financeRecords.sourceId, row.id), eq(financeRecords.status, "FINALIZED")));
      if (dependencies.some((r) => !r.reversalOfId))
        throw new ConflictException("Reverse dependent payments first");
      const [inverse] = await tx
        .insert(financeRecords)
        .values({
          ...row,
          id: randomUUID(),
          version: 1,
          reversalOfId: row.id,
          reversalReason: c.reason,
          createdBy: actor.userId,
          updatedBy: actor.userId,
          finalizedBy: actor.userId,
          createdAt: new Date(),
          updatedAt: new Date(),
          finalizedAt: new Date(),
        })
        .returning();
      const [original] = await tx
        .update(financeRecords)
        .set({
          status: "REVERSED",
          version: row.version + 1,
          updatedBy: actor.userId,
          updatedAt: new Date(),
        })
        .where(eq(financeRecords.id, row.id))
        .returning();
      if (!inverse || !original) throw new Error("Missing reversal");
      await this.record(tx, actor, "REVERSE", row, original, c.reason);
      await this.record(tx, actor, "REVERSAL_POSTED", null, inverse, c.reason);
      return { original, inverse };
    });
  }
  async list(projectId: string) {
    const entries = await this.db
      .select()
      .from(financeRecords)
      .where(eq(financeRecords.projectId, projectId));
    const sum = (kind: string) =>
      entries
        .filter((r) => r.kind === kind && ["FINALIZED", "REVERSED"].includes(r.status))
        .reduce(
          (n, r) =>
            n +
            BigInt(r.kind === "OWNER_CLAIM" ? (r.approvedToman ?? "0") : r.amountToman) *
              (r.reversalOfId ? -1n : 1n) *
              (r.direction === "DECREASE" ? -1n : 1n),
          0n,
        );
    return {
      entries,
      totals: {
        expenseToman: sum("EXPENSE").toString(),
        paidToman: sum("EXPENSE_PAYMENT").toString(),
        payableToman: (sum("EXPENSE") - sum("EXPENSE_PAYMENT")).toString(),
        amendmentsToman: sum("CONTRACT_AMENDMENT").toString(),
        approvedRevenueToman: sum("OWNER_CLAIM").toString(),
        receiptsToman: sum("OWNER_RECEIPT").toString(),
        receivableToman: (sum("OWNER_CLAIM") - sum("OWNER_RECEIPT")).toString(),
      },
    };
  }
  private async project(tx: Tx, id: string) {
    const [p] = await tx.select().from(projects).where(eq(projects.id, id)).for("update");
    if (!p) throw new NotFoundException();
    if (p.lifecycle !== "ACTIVE") throw new ConflictException("Project archived");
  }
  private async lock(tx: Tx, id: string) {
    const [r] = await tx
      .select()
      .from(financeRecords)
      .where(eq(financeRecords.id, id))
      .for("update");
    if (!r) throw new NotFoundException();
    return r;
  }
  private version(r: Row, v: number, status: string) {
    if (r.version !== v || r.status !== status)
      throw new ConflictException({ code: "STALE_VERSION", current: r });
  }
  private async record(
    tx: Tx,
    actor: Principal,
    action: string,
    before: unknown,
    after: { id: string },
    reason?: string,
  ) {
    await tx.insert(businessAudit).values({
      actorUserId: actor.userId,
      actorSessionId: actor.sessionId,
      entityType: "FINANCE",
      entityId: after.id,
      action,
      reason,
      beforeValue: before,
      afterValue: after,
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
        .insert(financeReceipts)
        .values({ userId: principal.userId, commandId, bodyHash, result: {} })
        .onConflictDoNothing({ target: [financeReceipts.userId, financeReceipts.commandId] })
        .returning({ commandId: financeReceipts.commandId });
      if (!claimed) {
        const [receipt] = await tx
          .select()
          .from(financeReceipts)
          .where(
            and(
              eq(financeReceipts.userId, principal.userId),
              eq(financeReceipts.commandId, commandId),
            ),
          )
          .limit(1);
        if (!receipt) throw new Error("Workforce command receipt is missing");
        if (receipt.bodyHash !== bodyHash)
          throw new ConflictException({
            code: "COMMAND_ID_CONFLICT",
            message: "Command ID was used with different content",
          });
        return { result: receipt.result as T, replayed: true };
      }
      const result = await operation(tx);
      await tx
        .update(financeReceipts)
        .set({ result })
        .where(
          and(
            eq(financeReceipts.userId, principal.userId),
            eq(financeReceipts.commandId, commandId),
          ),
        );
      return result;
    });
  }
}
