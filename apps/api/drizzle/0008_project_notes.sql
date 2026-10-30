ALTER TABLE "note_drafts" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "note_drafts" ADD CONSTRAINT "note_drafts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_drafts_project_created_idx" ON "note_drafts" USING btree ("project_id","created_at");
