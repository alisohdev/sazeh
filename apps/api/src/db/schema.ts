import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
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
