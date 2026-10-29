INSERT INTO sync_revision(singleton, revision) VALUES (1, 0)
ON CONFLICT (singleton) DO NOTHING;
--> statement-breakpoint
ALTER TABLE contacts ADD CONSTRAINT contacts_has_role_check CHECK (is_worker OR is_supplier OR is_owner);
--> statement-breakpoint
ALTER TABLE contacts ADD CONSTRAINT contacts_display_name_check CHECK (length(btrim(display_name)) > 0);
--> statement-breakpoint
ALTER TABLE projects ADD CONSTRAINT projects_name_check CHECK (length(btrim(name)) > 0);
--> statement-breakpoint
ALTER TABLE projects ADD CONSTRAINT projects_lifecycle_check CHECK (lifecycle IN ('ACTIVE', 'ARCHIVED'));
--> statement-breakpoint
ALTER TABLE projects ADD CONSTRAINT projects_contract_toman_check CHECK (contract_initial_toman ~ '^(0|[1-9][0-9]*)$');
--> statement-breakpoint
ALTER TABLE projects ADD CONSTRAINT projects_date_range_check CHECK (starts_on IS NULL OR ends_on IS NULL OR ends_on >= starts_on);
--> statement-breakpoint
ALTER TABLE engagements ADD CONSTRAINT engagements_rate_toman_check CHECK (default_rate_toman ~ '^(0|[1-9][0-9]*)$');
--> statement-breakpoint
ALTER TABLE engagements ADD CONSTRAINT engagements_date_range_check CHECK (ends_on IS NULL OR ends_on >= starts_on);
--> statement-breakpoint
ALTER TABLE project_budgets ADD CONSTRAINT project_budgets_category_check CHECK (length(btrim(category)) > 0);
--> statement-breakpoint
ALTER TABLE project_budgets ADD CONSTRAINT project_budgets_amount_toman_check CHECK (amount_toman ~ '^(0|[1-9][0-9]*)$' AND baseline_toman ~ '^(0|[1-9][0-9]*)$');
