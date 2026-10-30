CREATE TABLE "finance_command_receipts" (
	"user_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"body_hash" char(64) NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_command_receipts_user_id_command_id_pk" PRIMARY KEY("user_id","command_id")
);
--> statement-breakpoint
CREATE TABLE "finance_records" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"contact_id" uuid,
	"kind" varchar(24) NOT NULL,
	"business_date" char(10) NOT NULL,
	"amount_toman" varchar(24) NOT NULL,
	"description" text NOT NULL,
	"category" varchar(120) NOT NULL,
	"source_id" uuid,
	"direction" varchar(12) NOT NULL,
	"status" varchar(12) DEFAULT 'DRAFT' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"reversal_of_id" uuid,
	"reversal_reason" text,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"finalized_by" uuid,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "finance_amount_check" CHECK ("finance_records"."amount_toman" ~ '^[1-9][0-9]{0,23}$')
);
--> statement-breakpoint
ALTER TABLE "finance_command_receipts" ADD CONSTRAINT "finance_command_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_records" ADD CONSTRAINT "finance_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_records" ADD CONSTRAINT "finance_records_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_records" ADD CONSTRAINT "finance_records_source_id_finance_records_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."finance_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_records" ADD CONSTRAINT "finance_records_reversal_of_id_finance_records_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."finance_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_records" ADD CONSTRAINT "finance_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_records" ADD CONSTRAINT "finance_records_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_records" ADD CONSTRAINT "finance_records_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "finance_reversal_uq" ON "finance_records" USING btree ("reversal_of_id");