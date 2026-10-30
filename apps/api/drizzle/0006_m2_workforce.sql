CREATE TYPE "public"."workforce_record_kind" AS ENUM('EARNING', 'DEDUCTION', 'WORKER_PAYMENT');--> statement-breakpoint
CREATE TYPE "public"."workforce_record_status" AS ENUM('DRAFT', 'FINALIZED', 'REVERSED');--> statement-breakpoint
CREATE TABLE "workforce_command_receipts" (
	"user_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"body_hash" char(64) NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workforce_command_receipts_user_id_command_id_pk" PRIMARY KEY("user_id","command_id")
);
--> statement-breakpoint
CREATE TABLE "workforce_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"kind" "workforce_record_kind" NOT NULL,
	"business_date" char(10) NOT NULL,
	"engagement_type" "engagement_type",
	"quantity" varchar(32),
	"rate_toman" varchar(24),
	"amount_toman" varchar(24) NOT NULL,
	"payment_kind" varchar(12),
	"description" text NOT NULL,
	"status" "workforce_record_status" DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reversal_of_id" uuid,
	"reversal_reason" text,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"finalized_by" uuid,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workforce_records_amount_check" CHECK ("workforce_records"."amount_toman" ~ '^(0|[1-9][0-9]*)$' AND "workforce_records"."amount_toman" <> '0'),
	CONSTRAINT "workforce_records_quantity_check" CHECK ("workforce_records"."quantity" IS NULL OR "workforce_records"."quantity" ~ '^(0|[1-9][0-9]*)(\.[0-9]{1,3})?$'),
	CONSTRAINT "workforce_records_rate_check" CHECK ("workforce_records"."rate_toman" IS NULL OR "workforce_records"."rate_toman" ~ '^(0|[1-9][0-9]*)$'),
	CONSTRAINT "workforce_records_reversal_check" CHECK (("workforce_records"."reversal_of_id" IS NULL AND "workforce_records"."reversal_reason" IS NULL) OR ("workforce_records"."reversal_of_id" IS NOT NULL AND length(btrim("workforce_records"."reversal_reason")) BETWEEN 1 AND 1000))
);
--> statement-breakpoint
ALTER TABLE "workforce_command_receipts" ADD CONSTRAINT "workforce_command_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_records" ADD CONSTRAINT "workforce_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_records" ADD CONSTRAINT "workforce_records_worker_id_contacts_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_records" ADD CONSTRAINT "workforce_records_reversal_of_id_workforce_records_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."workforce_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_records" ADD CONSTRAINT "workforce_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_records" ADD CONSTRAINT "workforce_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workforce_records" ADD CONSTRAINT "workforce_records_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workforce_records_project_worker_date_idx" ON "workforce_records" USING btree ("project_id","worker_id","business_date");--> statement-breakpoint
CREATE INDEX "workforce_records_worker_status_date_idx" ON "workforce_records" USING btree ("worker_id","status","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "workforce_records_reversal_of_uq" ON "workforce_records" USING btree ("reversal_of_id");