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
  WorkforceDraftCommandSchema,
  WorkforceRecordInputSchema,
  WorkforceReportFilterSchema,
  type WorkforceDraftCommand,
  type WorkforceFinalizeCommand,
  type WorkforceRecordInput,
  type WorkforceReportFilter,
  type WorkforceReverseCommand,
} from "@sazeh/contracts";
import { and, asc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { ZodError } from "zod";
import { DATABASE, type Database } from "../db/database.module.js";
import {
  businessAudit,
  contacts,
  engagements,
  projects,
  syncChanges,
  syncRevision,
  workforceRecords,
  workforceReceipts,
} from "../db/schema.js";
import { claimsFor, requireLiveSession, type Principal } from "../identity/identity.service.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type WorkforceRow = typeof workforceRecords.$inferSelect;
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
export class WorkforceService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async syncDrafts(principal: Principal, commands: unknown[]) {
    if (commands.length > 100)
      throw new BadRequestException({
        code: "BATCH_TOO_LARGE",
        message: "At most 100 workforce drafts may be synchronized at once",
      });
    const results = [];
    for (const raw of commands) {
      try {
        const command = WorkforceDraftCommandSchema.parse(raw);
        results.push({ ok: true, result: await this.writeDraft(principal, command) });
      } catch (error) {
        results.push({ ok: false, status: statusOf(error), error: problemOf(error) });
      }
    }
    return { results };
  }

  async writeDraft(principal: Principal, command: WorkforceDraftCommand) {
    const input = WorkforceRecordInputSchema.parse(command.input);
    return this.withReceipt(principal, command.commandId, command, async (tx) => {
      if (principal.kind !== "workspace") throw new ForbiddenException();
      const project = await this.requireProject(tx, input.projectId);
      await this.requireWorker(tx, input.workerId);
      if (command.expectedVersion === 0) {
        const amountToman = await this.validateAndCalculate(tx, input);
        const now = new Date();
        const [record] = await tx
          .insert(workforceRecords)
          .values({
            id: command.recordId,
            ...recordFields(input, amountToman),
            createdBy: principal.userId,
            updatedBy: principal.userId,
            createdAt: now,
            updatedAt: now,
          })
          .returning();
        if (!record) throw new Error("Workforce draft insert returned no record");
        await this.record(tx, principal, "CREATE", null, record);
        return record;
      }
      const current = await this.lockRecord(tx, command.recordId);
      this.expectDraftVersion(current, command.expectedVersion);
      if (current.projectId !== project.id || current.workerId !== input.workerId)
        throw new ConflictException({
          code: "REASSIGNMENT_NOT_ALLOWED",
          message: "A workforce draft cannot be moved to another project or worker",
        });
      const amountToman = await this.validateAndCalculate(tx, input);
      const [record] = await tx
        .update(workforceRecords)
        .set({
          ...recordFields(input, amountToman),
          version: current.version + 1,
          updatedBy: principal.userId,
          updatedAt: new Date(),
        })
        .where(eq(workforceRecords.id, current.id))
        .returning();
      if (!record) throw new Error("Workforce draft update returned no record");
      await this.record(tx, principal, "UPDATE", current, record);
      return record;
    });
  }

  async finalize(principal: Principal, command: WorkforceFinalizeCommand) {
    return this.withReceipt(principal, command.commandId, command, async (tx) => {
      if (principal.kind !== "workspace") throw new ForbiddenException();
      const current = await this.lockRecord(tx, command.recordId);
      this.expectDraftVersion(current, command.expectedVersion);
      await requireReadyEvidence(tx, current.id, command.acknowledgePendingEvidence);
      await this.requireWorker(tx, current.workerId, true);
      await this.requireActiveProject(tx, current.projectId);
      if (current.kind === "EARNING") await this.requireEligibleEngagement(tx, current);
      const [record] = await tx
        .update(workforceRecords)
        .set({
          status: "FINALIZED",
          version: current.version + 1,
          finalizedBy: principal.userId,
          finalizedAt: new Date(),
          updatedBy: principal.userId,
          updatedAt: new Date(),
        })
        .where(eq(workforceRecords.id, current.id))
        .returning();
      if (!record) throw new Error("Workforce finalization returned no record");
      await this.record(tx, principal, "FINALIZE", current, record);
      return record;
    });
  }

  async reverse(principal: Principal, command: WorkforceReverseCommand) {
    return this.withReceipt(principal, command.commandId, command, async (tx) => {
      if (principal.kind !== "workspace") throw new ForbiddenException();
      const current = await this.lockRecord(tx, command.recordId);
      if (current.version !== command.expectedVersion)
        throw new ConflictException({
          code: "STALE_VERSION",
          message: "This workforce record changed",
          currentVersion: current.version,
          current,
        });
      if (current.reversalOfId)
        throw new ConflictException({
          code: "REVERSAL_NOT_REVERSIBLE",
          message: "A reversal record cannot be reversed",
        });
      if (current.status !== "FINALIZED")
        throw new ConflictException({
          code: "RECORD_NOT_REVERSIBLE",
          message: "Only a finalized workforce record can be reversed",
        });
      const [record] = await tx
        .insert(workforceRecords)
        .values({
          id: randomUUID(),
          projectId: current.projectId,
          workerId: current.workerId,
          kind: current.kind,
          businessDate: current.businessDate,
          engagementType: current.engagementType,
          quantity: current.quantity,
          rateToman: current.rateToman,
          amountToman: current.amountToman,
          paymentKind: current.paymentKind,
          description: current.description,
          status: "FINALIZED",
          version: 1,
          reversalOfId: current.id,
          reversalReason: command.reason,
          createdBy: principal.userId,
          updatedBy: principal.userId,
          finalizedBy: principal.userId,
          finalizedAt: new Date(),
        })
        .returning();
      if (!record) throw new Error("Workforce reversal insert returned no record");
      const [reversed] = await tx
        .update(workforceRecords)
        .set({
          status: "REVERSED",
          version: current.version + 1,
          updatedBy: principal.userId,
          updatedAt: new Date(),
        })
        .where(eq(workforceRecords.id, current.id))
        .returning();
      if (!reversed) throw new Error("Workforce reversal source returned no record");
      await this.record(tx, principal, "REVERSE", current, reversed, command.reason);
      await this.record(tx, principal, "REVERSAL_POSTED", null, record, command.reason);
      return { original: reversed, reversal: record };
    });
  }

  async list(filter: WorkforceReportFilter) {
    const rows = await this.loadRecords(filter);
    const finalized = rows.filter((row) => row.status === "FINALIZED" || row.status === "REVERSED");
    const drafts = rows.filter((row) => row.status === "DRAFT");
    const openingRows = filter.from ? await this.loadRecords(filter, filter.from) : [];
    const openingFinalized = openingRows.filter(
      (row) => row.status === "FINALIZED" || row.status === "REVERSED",
    );
    const openingBalanceToman = totalsOf(openingFinalized).remainingBalanceToman;
    const totals = totalsOf(finalized);
    return {
      filters: filter,
      totals,
      balances: {
        openingBalanceToman,
        closingBalanceToman: (
          BigInt(openingBalanceToman) + BigInt(totals.remainingBalanceToman)
        ).toString(),
      },
      pending: {
        count: drafts.length,
        amountToman: sum(drafts.map((row) => BigInt(row.amountToman))).toString(),
      },
      entries: rows,
    };
  }

  async analytics(filter: {
    workerId?: string | undefined;
    projectId?: string | undefined;
    from?: string | undefined;
    to?: string | undefined;
  }) {
    const normalized = WorkforceReportFilterSchema.partial().parse(filter);
    const rows = await this.loadRecords(normalized);
    const projectsById = new Map<
      string,
      { projectId: string; projectName: string; rows: typeof rows }
    >();
    for (const row of rows) {
      const item = projectsById.get(row.projectId) ?? {
        projectId: row.projectId,
        projectName: row.projectName,
        rows: [],
      };
      item.rows.push(row);
      projectsById.set(row.projectId, item);
    }
    return [...projectsById.values()].map(({ rows: projectRows, ...project }) => ({
      ...project,
      totals: totalsOf(
        projectRows.filter((row) => row.status === "FINALIZED" || row.status === "REVERSED"),
      ),
      pending: { count: projectRows.filter((row) => row.status === "DRAFT").length },
      entryIds: projectRows.filter((row) => row.status !== "DRAFT").map((row) => row.id),
    }));
  }

  private async loadRecords(
    filter: {
      workerId?: string | undefined;
      projectId?: string | undefined;
      from?: string | undefined;
      to?: string | undefined;
    },
    before?: string,
  ) {
    const conditions = [
      filter.workerId ? eq(workforceRecords.workerId, filter.workerId) : undefined,
      filter.projectId ? eq(workforceRecords.projectId, filter.projectId) : undefined,
      before ? lt(workforceRecords.businessDate, before) : undefined,
      !before && filter.from ? gte(workforceRecords.businessDate, filter.from) : undefined,
      !before && filter.to ? lte(workforceRecords.businessDate, filter.to) : undefined,
    ].filter(Boolean);
    const records = await this.db
      .select()
      .from(workforceRecords)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(
        asc(workforceRecords.businessDate),
        asc(workforceRecords.createdAt),
        asc(workforceRecords.id),
      );
    const [projectRows, workerRows] = await Promise.all([
      this.db.select().from(projects),
      this.db.select().from(contacts),
    ]);
    const projectNames = new Map(projectRows.map((row) => [row.id, row.name]));
    const workerNames = new Map(workerRows.map((row) => [row.id, row.displayName]));
    return records.map((row) => ({
      ...row,
      projectName: projectNames.get(row.projectId) ?? "",
      workerName: workerNames.get(row.workerId) ?? "",
    }));
  }

  private async validateAndCalculate(tx: Tx, input: WorkforceRecordInput): Promise<string> {
    if (input.kind !== "EARNING") return positiveToman(input.amountToman);
    const calculated = ["DAILY", "HOURLY", "QUANTITY"].includes(input.engagementType);
    const [assignment] = await tx
      .select()
      .from(engagements)
      .where(
        and(
          eq(engagements.projectId, input.projectId),
          eq(engagements.workerId, input.workerId),
          eq(engagements.archived, false),
          lte(engagements.startsOn, input.businessDate),
          sql`(${engagements.endsOn} IS NULL OR ${engagements.endsOn} >= ${input.businessDate})`,
        ),
      )
      .limit(1);
    if (!assignment || assignment.type !== input.engagementType)
      throw new ConflictException({
        code: "ENGAGEMENT_REQUIRED",
        message: "An active matching worker-project engagement is required for this date",
      });
    if (!calculated) return positiveToman(input.amountToman ?? "");
    if (!input.quantity || input.rateToman === undefined)
      throw new BadRequestException({
        code: "QUANTITY_RATE_REQUIRED",
        message: "Quantity and rate are required",
      });
    const amount = multiplyQuantityAndRate(input.quantity, positiveToman(input.rateToman, true));
    return positiveToman(amount);
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
        message: "Archived projects cannot receive finalized workforce records",
      });
    return project;
  }

  private async requireWorker(tx: Tx, id: string, lock = false) {
    const query = tx.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    const [worker] = lock ? await query.for("update") : await query;
    if (!worker || !worker.isWorker)
      throw new NotFoundException({ code: "WORKER_NOT_FOUND", message: "Worker was not found" });
    if (lock && worker.archived)
      throw new ConflictException({
        code: "WORKER_UNAVAILABLE",
        message: "Archived workers cannot receive finalized workforce records",
      });
    return worker;
  }

  private async requireEligibleEngagement(tx: Tx, record: WorkforceRow) {
    const [assignment] = await tx
      .select()
      .from(engagements)
      .where(
        and(
          eq(engagements.projectId, record.projectId),
          eq(engagements.workerId, record.workerId),
          eq(engagements.type, record.engagementType!),
          eq(engagements.archived, false),
          lte(engagements.startsOn, record.businessDate),
          sql`(${engagements.endsOn} IS NULL OR ${engagements.endsOn} >= ${record.businessDate})`,
        ),
      )
      .limit(1)
      .for("update");
    if (!assignment)
      throw new ConflictException({
        code: "ENGAGEMENT_REQUIRED",
        message: "An active matching worker-project engagement is required for this date",
      });
  }

  private async lockRecord(tx: Tx, id: string) {
    const [record] = await tx
      .select()
      .from(workforceRecords)
      .where(eq(workforceRecords.id, id))
      .limit(1)
      .for("update");
    if (!record)
      throw new NotFoundException({
        code: "WORKFORCE_RECORD_NOT_FOUND",
        message: "Workforce record was not found",
      });
    return record;
  }

  private expectDraftVersion(current: WorkforceRow, version: number) {
    if (current.version !== version)
      throw new ConflictException({
        code: "STALE_VERSION",
        message: "This workforce draft changed",
        currentVersion: current.version,
        current,
      });
    if (current.status !== "DRAFT")
      throw new ConflictException({
        code: "DRAFT_LOCKED",
        message: "Finalized workforce records cannot be edited",
      });
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
      entityType: "WORKFORCE",
      entityId: after.id,
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
      entityType: "WORKFORCE_RECORD",
      entityId: after.id,
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
        .insert(workforceReceipts)
        .values({ userId: principal.userId, commandId, bodyHash, result: {} })
        .onConflictDoNothing({ target: [workforceReceipts.userId, workforceReceipts.commandId] })
        .returning({ commandId: workforceReceipts.commandId });
      if (!claimed) {
        const [receipt] = await tx
          .select()
          .from(workforceReceipts)
          .where(
            and(
              eq(workforceReceipts.userId, principal.userId),
              eq(workforceReceipts.commandId, commandId),
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
        .update(workforceReceipts)
        .set({ result })
        .where(
          and(
            eq(workforceReceipts.userId, principal.userId),
            eq(workforceReceipts.commandId, commandId),
          ),
        );
      return result;
    });
  }
}

function recordFields(input: WorkforceRecordInput, amountToman: string) {
  return {
    projectId: input.projectId,
    workerId: input.workerId,
    kind: input.kind,
    businessDate: input.businessDate,
    engagementType: input.kind === "EARNING" ? input.engagementType : null,
    quantity:
      input.kind === "EARNING" && ["DAILY", "HOURLY", "QUANTITY"].includes(input.engagementType)
        ? (input.quantity ?? null)
        : null,
    rateToman:
      input.kind === "EARNING" && ["DAILY", "HOURLY", "QUANTITY"].includes(input.engagementType)
        ? (input.rateToman ?? null)
        : null,
    amountToman,
    paymentKind: input.kind === "WORKER_PAYMENT" ? input.paymentKind : null,
    description: input.description,
    status: "DRAFT" as const,
  };
}

function positiveToman(value: string, allowZero = false): string {
  if (!/^(0|[1-9][0-9]*)$/.test(value) || value.length > 24 || (!allowZero && value === "0"))
    throw new BadRequestException({
      code: "INVALID_AMOUNT",
      message: "Enter a valid whole-toman amount greater than zero",
    });
  return value;
}

export function multiplyQuantityAndRate(quantity: string, rateToman: string): string {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{1,3}))?$/.exec(quantity);
  if (!match || match[1]!.length > 15)
    throw new BadRequestException({
      code: "INVALID_QUANTITY",
      message: "Quantity supports up to three decimal places",
    });
  const whole = BigInt(match[1]!);
  const fraction = BigInt((match[2] ?? "").padEnd(3, "0") || "0");
  const scaledQuantity = whole * 1000n + fraction;
  if (scaledQuantity <= 0n)
    throw new BadRequestException({
      code: "INVALID_QUANTITY",
      message: "Quantity must be greater than zero",
    });
  const numerator = scaledQuantity * BigInt(positiveToman(rateToman, true));
  return ((numerator + 500n) / 1000n).toString();
}

function sum(values: bigint[]) {
  return values.reduce((total, value) => total + value, 0n);
}
function signedAmount(row: { amountToman: string; reversalOfId: string | null }) {
  const amount = BigInt(row.amountToman);
  return row.reversalOfId ? -amount : amount;
}
function totalsOf(rows: Array<{ kind: string; amountToman: string; reversalOfId: string | null }>) {
  const signed = (kind: string) => rows.filter((row) => row.kind === kind).map(signedAmount);
  const gross = sum(signed("EARNING"));
  const deductions = sum(signed("DEDUCTION"));
  const payments = sum(signed("WORKER_PAYMENT"));
  return {
    grossEarningsToman: gross.toString(),
    deductionsToman: deductions.toString(),
    netEarningsToman: (gross - deductions).toString(),
    paymentsToman: payments.toString(),
    remainingBalanceToman: (gross - deductions - payments).toString(),
  };
}

function statusOf(error: unknown): number {
  if (error instanceof ZodError) return 400;
  if (error instanceof BadRequestException) return 400;
  if (error instanceof ConflictException) return 409;
  if (error instanceof NotFoundException) return 404;
  if (error instanceof ForbiddenException) return 403;
  return 500;
}
function problemOf(error: unknown) {
  if (error instanceof ZodError)
    return {
      code: "INVALID_WORKFORCE_DRAFT",
      message: "Workforce draft is invalid",
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
  return { code: "WORKFORCE_COMMAND_FAILED", message: "Workforce draft could not be synchronized" };
}
