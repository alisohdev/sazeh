CREATE TYPE "public"."user_role" AS ENUM('SUPERUSER', 'ADMIN');--> statement-breakpoint
CREATE TABLE "command_receipts" (
	"command_id" uuid PRIMARY KEY NOT NULL,
	"canonical_request_hash" char(64) NOT NULL,
	"result_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "note_drafts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"text" varchar(4000) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" varchar(16) DEFAULT 'DRAFT' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "note_drafts_version_check" CHECK ("note_drafts"."version" = 1),
	CONSTRAINT "note_drafts_status_check" CHECK ("note_drafts"."status" = 'DRAFT'),
	CONSTRAINT "note_drafts_text_check" CHECK (length(btrim("note_drafts"."text")) between 1 and 4000)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(80) NOT NULL,
	"display_name" varchar(160) NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'ADMIN' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"credential_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "users_username_normalized_uq" ON "users" USING btree (lower("username"));