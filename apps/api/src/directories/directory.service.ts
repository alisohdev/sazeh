import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  ContactInputSchema,
  EngagementInputSchema,
  ProjectInputSchema,
  type DirectoryMutationKind,
} from "@sazeh/contracts";
import { and, asc, eq, gt, gte, isNull, lte, or, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../db/database.module.js";
import {
  businessAudit,
  contacts,
  engagements,
  financeRecords,
  projectBudgets,
  projects,
} from "../db/schema.js";
import { claimsFor, requireLiveSession, type Principal } from "../identity/identity.service.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Writer = Database | Tx;
type ListResource = "projects" | "contacts" | "engagements" | "budgets";
type ListCursor = { value: string; id: string };

@Injectable()
export class DirectoryService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listProjects(archived = false, cursor?: string, limit = 50) {
    const after = cursor ? decodeListCursor(cursor, "projects") : undefined;
    const rows = await this.db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.lifecycle, archived ? "ARCHIVED" : "ACTIVE"),
          after
            ? or(
                gt(projects.name, after.value),
                and(eq(projects.name, after.value), gt(projects.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(asc(projects.name), asc(projects.id))
      .limit(limit + 1);
    return pageResult(rows, limit, "projects", (row) => ({ value: row.name, id: row.id }));
  }

  async project(id: string) {
    const [project] = await this.db.select().from(projects).where(eq(projects.id, id)).limit(1);
    if (!project)
      throw new NotFoundException({ code: "PROJECT_NOT_FOUND", message: "Project was not found" });
    const [owner] = project.ownerContactId
      ? await this.db
          .select()
          .from(contacts)
          .where(eq(contacts.id, project.ownerContactId))
          .limit(1)
      : [];
    const links = await this.db
      .select()
      .from(engagements)
      .where(eq(engagements.projectId, id))
      .orderBy(asc(engagements.startsOn));
    const workers = links.length
      ? await this.db
          .select()
          .from(contacts)
          .where(sql`${contacts.id} in ${links.map((link) => link.workerId)}`)
      : [];
    const budgets = await this.db
      .select()
      .from(projectBudgets)
      .where(eq(projectBudgets.projectId, id))
      .orderBy(asc(projectBudgets.category));
    return {
      ...project,
      owner: owner ?? null,
      engagements: links.map((link) => ({
        ...link,
        worker: workers.find((worker) => worker.id === link.workerId) ?? null,
      })),
      budgets,
      workerCount: new Set(links.map((link) => link.workerId)).size,
    };
  }

  async listContacts(
    role?: "worker" | "supplier" | "owner",
    archived = false,
    cursor?: string,
    limit = 50,
  ) {
    const after = cursor ? decodeListCursor(cursor, "contacts") : undefined;
    const roleFilter =
      role === "worker"
        ? eq(contacts.isWorker, true)
        : role === "supplier"
          ? eq(contacts.isSupplier, true)
          : role === "owner"
            ? eq(contacts.isOwner, true)
            : undefined;
    const rows = await this.db
      .select()
      .from(contacts)
      .where(
        and(
          roleFilter,
          eq(contacts.archived, archived),
          after
            ? or(
                gt(contacts.displayName, after.value),
                and(eq(contacts.displayName, after.value), gt(contacts.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(asc(contacts.displayName), asc(contacts.id))
      .limit(limit + 1);
    return pageResult(rows, limit, "contacts", (row) => ({ value: row.displayName, id: row.id }));
  }

  async listEngagements(projectId?: string, workerId?: string, cursor?: string, limit = 50) {
    const after = cursor ? decodeListCursor(cursor, "engagements") : undefined;
    const filters = [
      projectId ? eq(engagements.projectId, projectId) : undefined,
      workerId ? eq(engagements.workerId, workerId) : undefined,
      after
        ? or(
            gt(engagements.startsOn, after.value),
            and(eq(engagements.startsOn, after.value), gt(engagements.id, after.id)),
          )
        : undefined,
    ].filter(Boolean);
    const rows = await this.db
      .select()
      .from(engagements)
      .where(filters.length ? and(...filters) : undefined)
      .orderBy(asc(engagements.startsOn), asc(engagements.id))
      .limit(limit + 1);
    return pageResult(rows, limit, "engagements", (row) => ({ value: row.startsOn, id: row.id }));
  }

  async budgets(projectId: string, cursor?: string, limit = 50) {
    const after = cursor ? decodeListCursor(cursor, "budgets") : undefined;
    await this.requireProject(this.db, projectId);
    const rows = await this.db
      .select()
      .from(projectBudgets)
      .where(
        and(
          eq(projectBudgets.projectId, projectId),
          after
            ? or(
                gt(projectBudgets.category, after.value),
                and(eq(projectBudgets.category, after.value), gt(projectBudgets.id, after.id)),
              )
            : undefined,
        ),
      )
      .orderBy(asc(projectBudgets.category), asc(projectBudgets.id))
      .limit(limit + 1);
    return pageResult(rows, limit, "budgets", (row) => ({ value: row.category, id: row.id }));
  }

  async write(
    principal: Principal,
    kind: DirectoryMutationKind,
    id: string,
    expectedVersion: number,
    payload: Record<string, unknown>,
  ) {
    return this.db.transaction(async (tx) => {
      await requireLiveSession(tx, claimsFor(principal), false, "share");
      return this.mutate(tx, principal, kind, id, expectedVersion, payload);
    });
  }
  async writeProject(
    principal: Principal,
    kind: "PROJECT_CREATE" | "PROJECT_UPDATE",
    id: string,
    expectedVersion: number,
    payload: Record<string, unknown>,
    budget?: { id: string; category: string; amountToman: string; expectedVersion: number },
  ) {
    return this.db.transaction(async (tx) => {
      await requireLiveSession(tx, claimsFor(principal), false, "share");
      const project = await this.mutate(tx, principal, kind, id, expectedVersion, payload);
      if (budget)
        await this.mutate(tx, principal, "BUDGET_SET", budget.id, budget.expectedVersion, {
          projectId: id,
          category: budget.category,
          amountToman: budget.amountToman,
        });
      return project;
    });
  }

  async setBudgets(
    principal: Principal,
    projectId: string,
    values: Array<{ id: string; category: string; amountToman: string; expectedVersion: number }>,
  ) {
    return this.db.transaction(async (tx) => {
      await requireLiveSession(tx, claimsFor(principal), false, "share");
      await this.requireProject(tx, projectId);
      const result = [];
      for (const value of values)
        result.push(
          await this.mutate(tx, principal, "BUDGET_SET", value.id, value.expectedVersion, {
            projectId,
            category: value.category,
            amountToman: value.amountToman,
          }),
        );
      return result;
    });
  }

  private async mutate(
    tx: Tx,
    actor: Principal,
    kind: DirectoryMutationKind,
    id: string,
    expectedVersion: number,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    if (actor.kind !== "workspace") throw new ForbiddenException();
    if (kind === "PROJECT_CREATE") {
      const value = ProjectInputSchema.parse(input);
      if (value.ownerContactId)
        await this.requireAssignableContact(tx, value.ownerContactId, "owner", true);
      const [row] = await tx
        .insert(projects)
        .values({
          id,
          ...value,
          lifecycle: "ACTIVE",
          createdBy: actor.userId,
          updatedBy: actor.userId,
        })
        .returning();
      return this.record(tx, actor, "PROJECT", id, "CREATE", null, row);
    }
    if (kind === "PROJECT_UPDATE") {
      const value = ProjectInputSchema.parse(input);
      const current = await this.currentProject(tx, id, expectedVersion);
      if (value.contractInitialToman !== current.contractInitialToman) {
        const [financial] = await tx
          .select({ id: financeRecords.id })
          .from(financeRecords)
          .where(eq(financeRecords.projectId, id))
          .limit(1);
        if (financial)
          throw new ConflictException({
            code: "INITIAL_CONTRACT_LOCKED",
            message: "Use a reasoned contract amendment",
          });
      }
      if (value.ownerContactId && value.ownerContactId !== current.ownerContactId) {
        if (current.lifecycle !== "ACTIVE")
          throw new ConflictException({
            code: "PROJECT_ARCHIVED",
            message: "Archived projects cannot receive new owner assignments",
          });
        await this.requireAssignableContact(tx, value.ownerContactId, "owner", true);
      }
      const [row] = await tx
        .update(projects)
        .set({
          ...value,
          version: current.version + 1,
          updatedBy: actor.userId,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();
      return this.record(tx, actor, "PROJECT", id, "UPDATE", current, row);
    }
    if (kind === "PROJECT_LIFECYCLE") {
      const current = await this.currentProject(tx, id, expectedVersion);
      const action = input.action;
      const reason = typeof input.reason === "string" ? input.reason.trim() : "";
      if ((action !== "ARCHIVE" && action !== "REOPEN") || !reason)
        throw new ConflictException({
          code: "REASON_REQUIRED",
          message: "A reason is required to archive or reopen",
        });
      if (
        (action === "ARCHIVE" && current.lifecycle !== "ACTIVE") ||
        (action === "REOPEN" && current.lifecycle !== "ARCHIVED")
      )
        throw new ConflictException({
          code: "INVALID_LIFECYCLE",
          message: "Project lifecycle has changed",
        });
      const [row] = await tx
        .update(projects)
        .set({
          lifecycle: action === "ARCHIVE" ? "ARCHIVED" : "ACTIVE",
          archiveReason: reason,
          version: current.version + 1,
          updatedBy: actor.userId,
          updatedAt: new Date(),
        })
        .where(eq(projects.id, id))
        .returning();
      return this.record(tx, actor, "PROJECT", id, action, current, row, reason);
    }
    if (kind === "CONTACT_CREATE" || kind === "CONTACT_UPDATE") {
      const value = ContactInputSchema.parse(input);
      if (!(value.isWorker || value.isSupplier || value.isOwner))
        throw new ConflictException({
          code: "CONTACT_ROLE_REQUIRED",
          message: "Select at least one contact role",
        });
      if (kind === "CONTACT_CREATE") {
        const [row] = await tx
          .insert(contacts)
          .values({ id, ...value, createdBy: actor.userId, updatedBy: actor.userId })
          .returning();
        return this.record(tx, actor, "CONTACT", id, "CREATE", null, row);
      }
      const [current] = await tx
        .select()
        .from(contacts)
        .where(eq(contacts.id, id))
        .limit(1)
        .for("update");
      this.expectVersion(current, expectedVersion, "CONTACT");
      const [row] = await tx
        .update(contacts)
        .set({
          ...value,
          version: current.version + 1,
          updatedBy: actor.userId,
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, id))
        .returning();
      return this.record(tx, actor, "CONTACT", id, "UPDATE", current, row);
    }
    if (kind === "CONTACT_LIFECYCLE") {
      const [current] = await tx
        .select()
        .from(contacts)
        .where(eq(contacts.id, id))
        .limit(1)
        .for("update");
      this.expectVersion(current, expectedVersion, "CONTACT");
      const action = input.action;
      const reason = typeof input.reason === "string" ? input.reason.trim() : "";
      if ((action !== "ARCHIVE" && action !== "REOPEN") || !reason)
        throw new ConflictException({
          code: "REASON_REQUIRED",
          message: "A reason is required to archive or reopen",
        });
      if ((action === "ARCHIVE" && current.archived) || (action === "REOPEN" && !current.archived))
        throw new ConflictException({
          code: "INVALID_LIFECYCLE",
          message: "Contact lifecycle has changed",
        });
      const [row] = await tx
        .update(contacts)
        .set({
          archived: action === "ARCHIVE",
          version: current.version + 1,
          updatedBy: actor.userId,
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, id))
        .returning();
      return this.record(tx, actor, "CONTACT", id, action, current, row, reason);
    }
    if (kind === "ENGAGEMENT_CREATE" || kind === "ENGAGEMENT_UPDATE") {
      const value = EngagementInputSchema.parse(input);
      await this.requireAssignableContact(tx, value.workerId, "worker", true);
      await this.requireProject(tx, value.projectId, true);
      if (kind === "ENGAGEMENT_UPDATE") {
        const [current] = await tx
          .select()
          .from(engagements)
          .where(eq(engagements.id, id))
          .limit(1)
          .for("update");
        this.expectVersion(current, expectedVersion, "ENGAGEMENT");
        await tx
          .select({ id: contacts.id })
          .from(contacts)
          .where(eq(contacts.id, value.workerId))
          .for("update");
        await this.assertNoOverlap(
          tx,
          value.workerId,
          value.projectId,
          value.startsOn,
          value.endsOn,
          id,
        );
        const [row] = await tx
          .update(engagements)
          .set({
            ...value,
            version: current.version + 1,
            updatedBy: actor.userId,
            updatedAt: new Date(),
          })
          .where(eq(engagements.id, id))
          .returning();
        return this.record(tx, actor, "ENGAGEMENT", id, "UPDATE", current, row);
      }
      await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.id, value.workerId))
        .for("update");
      await this.assertNoOverlap(tx, value.workerId, value.projectId, value.startsOn, value.endsOn);
      const [row] = await tx
        .insert(engagements)
        .values({ id, ...value, createdBy: actor.userId, updatedBy: actor.userId })
        .returning();
      return this.record(tx, actor, "ENGAGEMENT", id, "CREATE", null, row);
    }
    if (kind === "BUDGET_SET") {
      const projectId = String(input.projectId ?? "");
      const category = String(input.category ?? "").trim();
      const amountToman = String(input.amountToman ?? "");
      if (!category || category.length > 100 || !/^(0|[1-9][0-9]*)$/.test(amountToman))
        throw new ConflictException({
          code: "INVALID_BUDGET",
          message: "Budget category and whole toman amount are required",
        });
      await this.requireProject(tx, projectId, true);
      const [current] = await tx
        .select()
        .from(projectBudgets)
        .where(eq(projectBudgets.id, id))
        .limit(1)
        .for("update");
      if (current) this.expectVersion(current, expectedVersion, "BUDGET");
      else if (expectedVersion !== 0)
        throw new ConflictException({
          code: "STALE_VERSION",
          message: "Budget is no longer current",
        });
      const [row] = current
        ? await tx
            .update(projectBudgets)
            .set({
              projectId,
              category,
              amountToman,
              version: current.version + 1,
              updatedBy: actor.userId,
              updatedAt: new Date(),
            })
            .where(eq(projectBudgets.id, id))
            .returning()
        : await tx
            .insert(projectBudgets)
            .values({
              id,
              projectId,
              category,
              amountToman,
              baselineToman: amountToman,
              version: 1,
              updatedBy: actor.userId,
            })
            .returning();
      return this.record(
        tx,
        actor,
        "BUDGET",
        id,
        current ? "UPDATE" : "CREATE",
        current ?? null,
        row,
      );
    }
    throw new ConflictException({
      code: "UNSUPPORTED_COMMAND",
      message: "Directory command is unsupported",
    });
  }

  private async assertNoOverlap(
    tx: Tx,
    workerId: string,
    projectId: string,
    startsOn: string,
    endsOn: string | null,
    excludeId?: string,
  ) {
    const filters = [
      eq(engagements.workerId, workerId),
      eq(engagements.projectId, projectId),
      excludeId ? sql`${engagements.id} <> ${excludeId}` : undefined,
      or(isNull(engagements.endsOn), gte(engagements.endsOn, startsOn)),
      endsOn ? lte(engagements.startsOn, endsOn) : undefined,
    ].filter(Boolean);
    const [overlap] = await tx
      .select({ id: engagements.id })
      .from(engagements)
      .where(and(...filters))
      .limit(1);
    if (overlap)
      throw new ConflictException({
        code: "ENGAGEMENT_OVERLAP",
        message: "This worker already has an engagement during those dates for this project",
      });
  }

  private async requireAssignableContact(
    tx: Writer,
    id: string,
    role: "owner" | "worker",
    forUpdate = false,
  ) {
    const query = tx.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    const [contact] = forUpdate ? await query.for("update") : await query;
    if (!contact || contact.archived || (role === "worker" ? !contact.isWorker : !contact.isOwner))
      throw new ConflictException({
        code: "CONTACT_UNAVAILABLE",
        message: `An active ${role} contact is required`,
      });
    return contact;
  }

  private async requireProject(tx: Writer, id: string, forUpdate = false) {
    const query = tx.select().from(projects).where(eq(projects.id, id)).limit(1);
    const [project] = forUpdate ? await query.for("update") : await query;
    if (!project)
      throw new NotFoundException({ code: "PROJECT_NOT_FOUND", message: "Project was not found" });
    if (forUpdate && project.lifecycle !== "ACTIVE")
      throw new ConflictException({
        code: "PROJECT_ARCHIVED",
        message: "Archived projects cannot receive new assignments",
      });
    return project;
  }

  private async currentProject(tx: Tx, id: string, version: number) {
    const [row] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1)
      .for("update");
    this.expectVersion(row, version, "PROJECT");
    return row;
  }

  private expectVersion<T extends { version: number } | undefined>(
    row: T,
    version: number,
    entity: string,
  ): asserts row is Exclude<T, undefined> {
    if (!row)
      throw new NotFoundException({
        code: `${entity}_NOT_FOUND`,
        message: `${entity.toLowerCase()} was not found`,
      });
    if (row.version !== version)
      throw new ConflictException({
        code: "STALE_VERSION",
        message: "This record changed on the server",
        current: row,
      });
  }

  private async record(
    tx: Tx,
    actor: Principal,
    entityType: string,
    entityId: string,
    action: string,
    beforeValue: unknown,
    afterValue: unknown,
    reason?: string,
  ) {
    await tx.insert(businessAudit).values({
      actorUserId: actor.userId,
      actorSessionId: actor.sessionId,
      entityType,
      entityId,
      action,
      reason,
      beforeValue,
      afterValue,
    });
    return afterValue;
  }
}

function encodeListCursor(resource: ListResource, cursor: ListCursor): string {
  return Buffer.from(JSON.stringify({ resource, ...cursor })).toString("base64url");
}

function decodeListCursor(value: string, resource: ListResource): ListCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      resource?: unknown;
      value?: unknown;
      id?: unknown;
    };
    if (
      parsed.resource !== resource ||
      typeof parsed.value !== "string" ||
      typeof parsed.id !== "string"
    )
      throw new Error("Invalid list cursor");
    return { value: parsed.value, id: parsed.id };
  } catch {
    throw new BadRequestException({
      code: "INVALID_LIST_CURSOR",
      message: "The list cursor is invalid",
    });
  }
}

function pageResult<T>(
  rows: T[],
  limit: number,
  resource: ListResource,
  keyOf: (row: T) => ListCursor,
) {
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? encodeListCursor(resource, keyOf(last)) : null,
  };
}
