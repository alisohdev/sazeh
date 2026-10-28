import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
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
    text: varchar("text", { length: 4000 }).notNull(),
    version: integer("version").notNull().default(1),
    status: varchar("status", { length: 16 }).notNull().default("DRAFT"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (table) => [
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
