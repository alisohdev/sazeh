import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["SUPERUSER", "ADMIN"]);
export const engagementType = pgEnum("engagement_type", [
  "DAILY",
  "HOURLY",
  "QUANTITY",
  "MONTHLY",
  "FIXED_CONTRACT",
  "MANUAL",
]);
export const workforceRecordKind = pgEnum("workforce_record_kind", [
  "EARNING",
  "DEDUCTION",
  "WORKER_PAYMENT",
]);
export const workforceRecordStatus = pgEnum("workforce_record_status", [
  "DRAFT",
  "FINALIZED",
  "REVERSED",
]);
export const procurementDocumentKind = pgEnum("procurement_document_kind", [
  "PURCHASE_INVOICE",
  "SUPPLIER_PAYMENT",
  "STOCK_RECEIPT",
  "STOCK_ISSUE",
  "STOCK_TRANSFER",
  "STOCK_RETURN",
  "SUPPLIER_RETURN",
]);
export const procurementDocumentStatus = pgEnum("procurement_document_status", [
  "DRAFT",
  "FINALIZED",
  "REVERSED",
]);

export const contacts = pgTable("contacts", {
  id: uuid("id").primaryKey(),
  displayName: varchar("display_name", { length: 160 }).notNull(),
  phone: varchar("phone", { length: 40 }),
  isWorker: boolean("is_worker").notNull().default(false),
  isSupplier: boolean("is_supplier").notNull().default(false),
  isOwner: boolean("is_owner").notNull().default(false),
  archived: boolean("archived").notNull().default(false),
  version: integer("version").notNull().default(1),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  updatedBy: uuid("updated_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    ownerContactId: uuid("owner_contact_id").references(() => contacts.id),
    startsOn: char("starts_on", { length: 10 }),
    endsOn: char("ends_on", { length: 10 }),
    lifecycle: varchar("lifecycle", { length: 12 }).notNull().default("ACTIVE"),
    archiveReason: text("archive_reason"),
    contractInitialToman: varchar("contract_initial_toman", { length: 24 }).notNull().default("0"),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("projects_lifecycle_name_idx").on(table.lifecycle, table.name)],
);

export const engagements = pgTable(
  "engagements",
  {
    id: uuid("id").primaryKey(),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => contacts.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    type: engagementType("type").notNull(),
    defaultRateToman: varchar("default_rate_toman", { length: 24 }).notNull(),
    startsOn: char("starts_on", { length: 10 }).notNull(),
    endsOn: char("ends_on", { length: 10 }),
    archived: boolean("archived").notNull().default(false),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("engagements_worker_project_dates_idx").on(
      table.workerId,
      table.projectId,
      table.startsOn,
      table.endsOn,
    ),
  ],
);

export const workforceRecords = pgTable(
  "workforce_records",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => contacts.id),
    kind: workforceRecordKind("kind").notNull(),
    businessDate: char("business_date", { length: 10 }).notNull(),
    engagementType: engagementType("engagement_type"),
    quantity: varchar("quantity", { length: 32 }),
    rateToman: varchar("rate_toman", { length: 24 }),
    amountToman: varchar("amount_toman", { length: 24 }).notNull(),
    paymentKind: varchar("payment_kind", { length: 12 }),
    description: text("description").notNull(),
    status: workforceRecordStatus("status").notNull().default("DRAFT"),
    version: integer("version").notNull().default(1),
    reversalOfId: uuid("reversal_of_id").references((): AnyPgColumn => workforceRecords.id),
    reversalReason: text("reversal_reason"),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id),
    finalizedBy: uuid("finalized_by").references(() => users.id),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("workforce_records_project_worker_date_idx").on(
      table.projectId,
      table.workerId,
      table.businessDate,
    ),
    index("workforce_records_worker_status_date_idx").on(
      table.workerId,
      table.status,
      table.businessDate,
    ),
    uniqueIndex("workforce_records_reversal_of_uq").on(table.reversalOfId),
    check(
      "workforce_records_amount_check",
      sql`${table.amountToman} ~ '^(0|[1-9][0-9]*)$' AND ${table.amountToman} <> '0'`,
    ),
    check(
      "workforce_records_quantity_check",
      sql`${table.quantity} IS NULL OR ${table.quantity} ~ '^(0|[1-9][0-9]*)(\\.[0-9]{1,3})?$'`,
    ),
    check(
      "workforce_records_rate_check",
      sql`${table.rateToman} IS NULL OR ${table.rateToman} ~ '^(0|[1-9][0-9]*)$'`,
    ),
    check(
      "workforce_records_reversal_check",
      sql`(${table.reversalOfId} IS NULL AND ${table.reversalReason} IS NULL) OR (${table.reversalOfId} IS NOT NULL AND length(btrim(${table.reversalReason})) BETWEEN 1 AND 1000)`,
    ),
    check(
      "workforce_records_description_check",
      sql`length(btrim(${table.description})) BETWEEN 1 AND 1000`,
    ),
    check(
      "workforce_records_kind_fields_check",
      sql`(${table.kind} = 'EARNING' AND ${table.engagementType} IS NOT NULL AND ((${table.engagementType} IN ('DAILY','HOURLY','QUANTITY') AND ${table.quantity} IS NOT NULL AND ${table.rateToman} IS NOT NULL) OR (${table.engagementType} IN ('MONTHLY','FIXED_CONTRACT','MANUAL') AND ${table.quantity} IS NULL AND ${table.rateToman} IS NULL))) OR (${table.kind} <> 'EARNING' AND ${table.engagementType} IS NULL AND ${table.quantity} IS NULL AND ${table.rateToman} IS NULL)`,
    ),
    check(
      "workforce_records_payment_kind_check",
      sql`(${table.kind} = 'WORKER_PAYMENT' AND ${table.paymentKind} IN ('PAYMENT','ADVANCE')) OR (${table.kind} <> 'WORKER_PAYMENT' AND ${table.paymentKind} IS NULL)`,
    ),
    check(
      "workforce_records_finalized_fields_check",
      sql`(${table.status} = 'DRAFT' AND ${table.finalizedBy} IS NULL AND ${table.finalizedAt} IS NULL) OR (${table.status} IN ('FINALIZED','REVERSED') AND ${table.finalizedBy} IS NOT NULL AND ${table.finalizedAt} IS NOT NULL)`,
    ),
  ],
);

export const workforceReceipts = pgTable(
  "workforce_command_receipts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    commandId: uuid("command_id").notNull(),
    bodyHash: char("body_hash", { length: 64 }).notNull(),
    result: jsonb("result").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.commandId] })],
);

export const materials = pgTable(
  "materials",
  {
    id: uuid("id").primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    baseUnit: varchar("base_unit", { length: 40 }).notNull(),
    archived: boolean("archived").notNull().default(false),
    archiveReason: text("archive_reason"),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("materials_archived_name_idx").on(table.archived, table.name),
    check("materials_name_check", sql`length(btrim(${table.name})) BETWEEN 1 AND 160`),
    check("materials_unit_check", sql`length(btrim(${table.baseUnit})) BETWEEN 1 AND 40`),
  ],
);

export const procurementDocuments = pgTable(
  "procurement_documents",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    destinationProjectId: uuid("destination_project_id").references(() => projects.id),
    supplierId: uuid("supplier_id").references(() => contacts.id),
    kind: procurementDocumentKind("kind").notNull(),
    businessDate: char("business_date", { length: 10 }).notNull(),
    description: text("description").notNull(),
    status: procurementDocumentStatus("status").notNull().default("DRAFT"),
    totalToman: numeric("total_toman", { precision: 24, scale: 0 }).notNull().default("0"),
    receiveAllNow: boolean("receive_all_now").notNull().default(false),
    invoiceId: uuid("invoice_id").references((): AnyPgColumn => procurementDocuments.id),
    sourceDocumentId: uuid("source_document_id").references(
      (): AnyPgColumn => procurementDocuments.id,
    ),
    reversalOfId: uuid("reversal_of_id").references((): AnyPgColumn => procurementDocuments.id),
    reversalReason: text("reversal_reason"),
    version: integer("version").notNull().default(1),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id),
    finalizedBy: uuid("finalized_by").references(() => users.id),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("procurement_documents_project_status_date_idx").on(
      table.projectId,
      table.status,
      table.businessDate,
    ),
    index("procurement_documents_supplier_status_date_idx").on(
      table.supplierId,
      table.status,
      table.businessDate,
    ),
    uniqueIndex("procurement_documents_reversal_of_uq").on(table.reversalOfId),
    check("procurement_documents_total_check", sql`${table.totalToman} >= 0`),
    check(
      "procurement_documents_description_check",
      sql`length(btrim(${table.description})) BETWEEN 1 AND 1000`,
    ),
    check(
      "procurement_documents_transfer_check",
      sql`(${table.kind} = 'STOCK_TRANSFER' AND ${table.destinationProjectId} IS NOT NULL AND ${table.destinationProjectId} <> ${table.projectId}) OR (${table.kind} <> 'STOCK_TRANSFER' AND ${table.destinationProjectId} IS NULL)`,
    ),
    check(
      "procurement_documents_supplier_check",
      sql`(${table.kind} IN ('PURCHASE_INVOICE','SUPPLIER_PAYMENT','STOCK_RECEIPT','SUPPLIER_RETURN') AND ${table.supplierId} IS NOT NULL) OR (${table.kind} NOT IN ('PURCHASE_INVOICE','SUPPLIER_PAYMENT','STOCK_RECEIPT','SUPPLIER_RETURN') AND ${table.supplierId} IS NULL)`,
    ),
    check(
      "procurement_documents_finalized_check",
      sql`(${table.status} = 'DRAFT' AND ${table.finalizedBy} IS NULL AND ${table.finalizedAt} IS NULL) OR (${table.status} IN ('FINALIZED','REVERSED') AND ${table.finalizedBy} IS NOT NULL AND ${table.finalizedAt} IS NOT NULL)`,
    ),
  ],
);

export const procurementLines = pgTable(
  "procurement_lines",
  {
    id: uuid("id").primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => procurementDocuments.id),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id),
    sourceLineId: uuid("source_line_id").references((): AnyPgColumn => procurementLines.id),
    quantity: numeric("quantity", { precision: 18, scale: 3 }).notNull(),
    unitPriceToman: numeric("unit_price_toman", { precision: 24, scale: 0 }),
    lineTotalToman: numeric("line_total_toman", { precision: 24, scale: 0 }).notNull().default("0"),
    carryingValueToman: numeric("carrying_value_toman", { precision: 24, scale: 0 }),
    supplierCreditToman: numeric("supplier_credit_toman", { precision: 24, scale: 0 }),
    valuationAdjustmentToman: numeric("valuation_adjustment_toman", {
      precision: 24,
      scale: 0,
    }),
  },
  (table) => [
    index("procurement_lines_document_idx").on(table.documentId),
    index("procurement_lines_material_idx").on(table.materialId),
    index("procurement_lines_source_idx").on(table.sourceLineId),
    check("procurement_lines_quantity_check", sql`${table.quantity} > 0`),
    check("procurement_lines_totals_check", sql`${table.lineTotalToman} >= 0`),
  ],
);

export const supplierPaymentAllocations = pgTable(
  "supplier_payment_allocations",
  {
    paymentDocumentId: uuid("payment_document_id")
      .notNull()
      .references(() => procurementDocuments.id),
    invoiceDocumentId: uuid("invoice_document_id")
      .notNull()
      .references(() => procurementDocuments.id),
    amountToman: numeric("amount_toman", { precision: 24, scale: 0 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.paymentDocumentId, table.invoiceDocumentId] }),
    check("supplier_payment_allocations_amount_check", sql`${table.amountToman} > 0`),
  ],
);

export const stockBalances = pgTable(
  "stock_balances",
  {
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id),
    quantity: numeric("quantity", { precision: 18, scale: 3 }).notNull().default("0"),
    carryingValueToman: numeric("carrying_value_toman", { precision: 24, scale: 0 })
      .notNull()
      .default("0"),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.materialId] }),
    check("stock_balances_quantity_check", sql`${table.quantity} >= 0`),
    check("stock_balances_value_check", sql`${table.carryingValueToman} >= 0`),
  ],
);

export const stockMovements = pgTable(
  "stock_movements",
  {
    postingOrder: bigserial("posting_order", { mode: "number" }).primaryKey(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => procurementDocuments.id),
    lineId: uuid("line_id")
      .notNull()
      .references(() => procurementLines.id),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    materialId: uuid("material_id")
      .notNull()
      .references(() => materials.id),
    quantityDelta: numeric("quantity_delta", { precision: 18, scale: 3 }).notNull(),
    valueDeltaToman: numeric("value_delta_toman", { precision: 24, scale: 0 }).notNull(),
    pairedTransferId: uuid("paired_transfer_id"),
    postedAt: timestamp("posted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("stock_movements_project_material_order_idx").on(
      table.projectId,
      table.materialId,
      table.postingOrder,
    ),
    index("stock_movements_document_idx").on(table.documentId),
    check("stock_movements_nonzero_quantity_check", sql`${table.quantityDelta} <> 0`),
  ],
);

export const procurementReceipts = pgTable(
  "procurement_command_receipts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    commandId: uuid("command_id").notNull(),
    bodyHash: char("body_hash", { length: 64 }).notNull(),
    result: jsonb("result").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.commandId] })],
);

export const projectBudgets = pgTable(
  "project_budgets",
  {
    id: uuid("id").primaryKey(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    category: varchar("category", { length: 100 }).notNull(),
    amountToman: varchar("amount_toman", { length: 24 }).notNull(),
    baselineToman: varchar("baseline_toman", { length: 24 }).notNull(),
    version: integer("version").notNull().default(1),
    updatedBy: uuid("updated_by")
      .notNull()
      .references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("project_budgets_project_category_uq").on(table.projectId, table.category),
  ],
);

export const businessAudit = pgTable("business_audit", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => users.id),
  actorSessionId: uuid("actor_session_id")
    .notNull()
    .references(() => sessions.id),
  entityType: varchar("entity_type", { length: 24 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  action: varchar("action", { length: 32 }).notNull(),
  reason: text("reason"),
  beforeValue: jsonb("before_value").$type<unknown>(),
  afterValue: jsonb("after_value").$type<unknown>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const syncRevision = pgTable("sync_revision", {
  singleton: integer("singleton").primaryKey(),
  revision: integer("revision").notNull(),
  minimumCursor: integer("minimum_cursor").notNull().default(0),
});
export const syncChanges = pgTable("sync_changes", {
  revision: integer("revision").primaryKey(),
  entityType: varchar("entity_type", { length: 24 }).notNull(),
  entityId: uuid("entity_id").notNull(),
  snapshot: jsonb("snapshot").$type<unknown>().notNull(),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => users.id),
  committedAt: timestamp("committed_at", { withTimezone: true }).notNull().defaultNow(),
});
export const directoryBootstrapSnapshots = pgTable("directory_bootstrap_snapshots", {
  id: uuid("id").primaryKey(),
  revision: integer("revision").notNull(),
  items: jsonb("items")
    .$type<Array<{ entityType: string; entity: Record<string, unknown> }>>()
    .notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const directoryReceipts = pgTable(
  "directory_command_receipts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    commandId: uuid("command_id").notNull(),
    bodyHash: char("body_hash", { length: 64 }).notNull(),
    result: jsonb("result").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.commandId] })],
);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    username: varchar("username", { length: 80 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("ADMIN"),
    active: boolean("active").notNull().default(true),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    credentialVersion: integer("credential_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("users_username_normalized_uq").on(sql`lower(${table.username})`)],
);

export const noteDrafts = pgTable(
  "note_drafts",
  {
    id: uuid("id").primaryKey(),
    authorUserId: uuid("author_user_id").references(() => users.id),
    projectId: uuid("project_id").references(() => projects.id),
    text: varchar("text", { length: 4000 }).notNull(),
    version: integer("version").notNull().default(1),
    status: varchar("status", { length: 16 }).notNull().default("DRAFT"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("note_drafts_project_created_idx").on(table.projectId, table.createdAt),
    check("note_drafts_version_check", sql`${table.version} = 1`),
    check("note_drafts_status_check", sql`${table.status} = 'DRAFT'`),
    check("note_drafts_text_check", sql`length(btrim(${table.text})) between 1 and 4000`),
  ],
);

export const commandReceipts = pgTable("command_receipts", {
  commandId: uuid("command_id").primaryKey(),
  canonicalRequestHash: char("canonical_request_hash", { length: 64 }).notNull(),
  resultSnapshot: jsonb("result_snapshot").$type<unknown>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    credentialVersion: integer("credential_version").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revocationReason: text("revocation_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("sessions_user_idx").on(table.userId)],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    tokenHash: char("token_hash", { length: 64 }).primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id),
    generation: integer("generation").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("refresh_tokens_session_generation_uq").on(table.sessionId, table.generation),
  ],
);

export const loginBuckets = pgTable("login_buckets", {
  key: char("key", { length: 64 }).primaryKey(),
  attempts: integer("attempts").notNull(),
  resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
});

export const authenticatedReceipts = pgTable(
  "authenticated_command_receipts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    commandId: uuid("command_id").notNull(),
    canonicalRequestHash: char("canonical_request_hash", { length: 64 }).notNull(),
    resultSnapshot: jsonb("result_snapshot").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.commandId] })],
);

export const accountAudit = pgTable("account_audit", {
  id: uuid("id").defaultRandom().primaryKey(),
  actorUserId: uuid("actor_user_id")
    .notNull()
    .references(() => users.id),
  actorSessionId: uuid("actor_session_id")
    .notNull()
    .references(() => sessions.id),
  targetUserId: uuid("target_user_id")
    .notNull()
    .references(() => users.id),
  action: varchar("action", { length: 40 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
