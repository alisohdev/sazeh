CREATE TABLE "attachment_targets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_type" varchar(16) NOT NULL,
	"finance_id" uuid,
	"workforce_id" uuid,
	"procurement_id" uuid,
	"project_id" uuid,
	CONSTRAINT "attachment_target_parent_check" CHECK (num_nonnulls("attachment_targets"."finance_id","attachment_targets"."workforce_id","attachment_targets"."procurement_id","attachment_targets"."project_id")=1 AND (("attachment_targets"."parent_type"='FINANCE' AND "attachment_targets"."finance_id" IS NOT NULL AND "attachment_targets"."finance_id"="attachment_targets"."id") OR ("attachment_targets"."parent_type"='WORKFORCE' AND "attachment_targets"."workforce_id" IS NOT NULL AND "attachment_targets"."workforce_id"="attachment_targets"."id") OR ("attachment_targets"."parent_type"='PROCUREMENT' AND "attachment_targets"."procurement_id" IS NOT NULL AND "attachment_targets"."procurement_id"="attachment_targets"."id") OR ("attachment_targets"."parent_type"='PROJECT' AND "attachment_targets"."project_id" IS NOT NULL AND "attachment_targets"."project_id"="attachment_targets"."id")))
);
--> statement-breakpoint
ALTER TABLE "attachments" DROP CONSTRAINT "attachments_record_id_finance_records_id_fk";
--> statement-breakpoint
ALTER TABLE "attachment_targets" ADD CONSTRAINT "attachment_targets_finance_id_finance_records_id_fk" FOREIGN KEY ("finance_id") REFERENCES "public"."finance_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_targets" ADD CONSTRAINT "attachment_targets_workforce_id_workforce_records_id_fk" FOREIGN KEY ("workforce_id") REFERENCES "public"."workforce_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_targets" ADD CONSTRAINT "attachment_targets_procurement_id_procurement_documents_id_fk" FOREIGN KEY ("procurement_id") REFERENCES "public"."procurement_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachment_targets" ADD CONSTRAINT "attachment_targets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
INSERT INTO "attachment_targets" ("id","parent_type","finance_id") SELECT DISTINCT "record_id", 'FINANCE', "record_id" FROM "attachments";
--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_record_id_attachment_targets_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."attachment_targets"("id") ON DELETE no action ON UPDATE no action;