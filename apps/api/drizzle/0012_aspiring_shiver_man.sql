CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"record_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"filename" text NOT NULL,
	"media_type" varchar(32) NOT NULL,
	"size" integer NOT NULL,
	"object_key" text NOT NULL,
	"state" varchar(12) DEFAULT 'STAGED' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_record_id_finance_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."finance_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;