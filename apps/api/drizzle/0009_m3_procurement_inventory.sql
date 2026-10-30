CREATE TYPE "public"."procurement_document_kind" AS ENUM('PURCHASE_INVOICE', 'SUPPLIER_PAYMENT', 'STOCK_RECEIPT', 'STOCK_ISSUE', 'STOCK_TRANSFER', 'STOCK_RETURN', 'SUPPLIER_RETURN');--> statement-breakpoint
CREATE TYPE "public"."procurement_document_status" AS ENUM('DRAFT', 'FINALIZED', 'REVERSED');--> statement-breakpoint
CREATE TABLE "materials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"base_unit" varchar(40) NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"archive_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "materials_name_check" CHECK (length(btrim("materials"."name")) BETWEEN 1 AND 160),
	CONSTRAINT "materials_unit_check" CHECK (length(btrim("materials"."base_unit")) BETWEEN 1 AND 40)
);
--> statement-breakpoint
CREATE TABLE "procurement_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"destination_project_id" uuid,
	"supplier_id" uuid,
	"kind" "procurement_document_kind" NOT NULL,
	"business_date" char(10) NOT NULL,
	"description" text NOT NULL,
	"status" "procurement_document_status" DEFAULT 'DRAFT' NOT NULL,
	"total_toman" numeric(24, 0) DEFAULT '0' NOT NULL,
	"receive_all_now" boolean DEFAULT false NOT NULL,
	"invoice_id" uuid,
	"source_document_id" uuid,
	"reversal_of_id" uuid,
	"reversal_reason" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" uuid NOT NULL,
	"updated_by" uuid NOT NULL,
	"finalized_by" uuid,
	"finalized_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procurement_documents_total_check" CHECK ("procurement_documents"."total_toman" >= 0),
	CONSTRAINT "procurement_documents_description_check" CHECK (length(btrim("procurement_documents"."description")) BETWEEN 1 AND 1000),
	CONSTRAINT "procurement_documents_transfer_check" CHECK (("procurement_documents"."kind" = 'STOCK_TRANSFER' AND "procurement_documents"."destination_project_id" IS NOT NULL AND "procurement_documents"."destination_project_id" <> "procurement_documents"."project_id") OR ("procurement_documents"."kind" <> 'STOCK_TRANSFER' AND "procurement_documents"."destination_project_id" IS NULL)),
	CONSTRAINT "procurement_documents_supplier_check" CHECK (("procurement_documents"."kind" IN ('PURCHASE_INVOICE','SUPPLIER_PAYMENT','STOCK_RECEIPT','SUPPLIER_RETURN') AND "procurement_documents"."supplier_id" IS NOT NULL) OR ("procurement_documents"."kind" NOT IN ('PURCHASE_INVOICE','SUPPLIER_PAYMENT','STOCK_RECEIPT','SUPPLIER_RETURN') AND "procurement_documents"."supplier_id" IS NULL)),
	CONSTRAINT "procurement_documents_finalized_check" CHECK (("procurement_documents"."status" = 'DRAFT' AND "procurement_documents"."finalized_by" IS NULL AND "procurement_documents"."finalized_at" IS NULL) OR ("procurement_documents"."status" IN ('FINALIZED','REVERSED') AND "procurement_documents"."finalized_by" IS NOT NULL AND "procurement_documents"."finalized_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "procurement_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"source_line_id" uuid,
	"quantity" numeric(18, 3) NOT NULL,
	"unit_price_toman" numeric(24, 0),
	"line_total_toman" numeric(24, 0) DEFAULT '0' NOT NULL,
	"carrying_value_toman" numeric(24, 0),
	"supplier_credit_toman" numeric(24, 0),
	"valuation_adjustment_toman" numeric(24, 0),
	CONSTRAINT "procurement_lines_quantity_check" CHECK ("procurement_lines"."quantity" > 0),
	CONSTRAINT "procurement_lines_totals_check" CHECK ("procurement_lines"."line_total_toman" >= 0)
);
--> statement-breakpoint
CREATE TABLE "procurement_command_receipts" (
	"user_id" uuid NOT NULL,
	"command_id" uuid NOT NULL,
	"body_hash" char(64) NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procurement_command_receipts_user_id_command_id_pk" PRIMARY KEY("user_id","command_id")
);
--> statement-breakpoint
CREATE TABLE "stock_balances" (
	"project_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"quantity" numeric(18, 3) DEFAULT '0' NOT NULL,
	"carrying_value_toman" numeric(24, 0) DEFAULT '0' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_balances_project_id_material_id_pk" PRIMARY KEY("project_id","material_id"),
	CONSTRAINT "stock_balances_quantity_check" CHECK ("stock_balances"."quantity" >= 0),
	CONSTRAINT "stock_balances_value_check" CHECK ("stock_balances"."carrying_value_toman" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"posting_order" bigserial PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"line_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"quantity_delta" numeric(18, 3) NOT NULL,
	"value_delta_toman" numeric(24, 0) NOT NULL,
	"paired_transfer_id" uuid,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_nonzero_quantity_check" CHECK ("stock_movements"."quantity_delta" <> 0)
);
--> statement-breakpoint
CREATE TABLE "supplier_payment_allocations" (
	"payment_document_id" uuid NOT NULL,
	"invoice_document_id" uuid NOT NULL,
	"amount_toman" numeric(24, 0) NOT NULL,
	CONSTRAINT "supplier_payment_allocations_payment_document_id_invoice_document_id_pk" PRIMARY KEY("payment_document_id","invoice_document_id"),
	CONSTRAINT "supplier_payment_allocations_amount_check" CHECK ("supplier_payment_allocations"."amount_toman" > 0)
);
--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_documents" ADD CONSTRAINT "procurement_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_documents" ADD CONSTRAINT "procurement_documents_destination_project_id_projects_id_fk" FOREIGN KEY ("destination_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_documents" ADD CONSTRAINT "procurement_documents_supplier_id_contacts_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."contacts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_documents" ADD CONSTRAINT "procurement_documents_invoice_id_procurement_documents_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."procurement_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_documents" ADD CONSTRAINT "procurement_documents_source_document_id_procurement_documents_id_fk" FOREIGN KEY ("source_document_id") REFERENCES "public"."procurement_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_documents" ADD CONSTRAINT "procurement_documents_reversal_of_id_procurement_documents_id_fk" FOREIGN KEY ("reversal_of_id") REFERENCES "public"."procurement_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_documents" ADD CONSTRAINT "procurement_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_documents" ADD CONSTRAINT "procurement_documents_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_documents" ADD CONSTRAINT "procurement_documents_finalized_by_users_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_lines" ADD CONSTRAINT "procurement_lines_document_id_procurement_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."procurement_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_lines" ADD CONSTRAINT "procurement_lines_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_lines" ADD CONSTRAINT "procurement_lines_source_line_id_procurement_lines_id_fk" FOREIGN KEY ("source_line_id") REFERENCES "public"."procurement_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_command_receipts" ADD CONSTRAINT "procurement_command_receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_balances" ADD CONSTRAINT "stock_balances_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_document_id_procurement_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."procurement_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_line_id_procurement_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."procurement_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_material_id_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_payment_document_id_procurement_documents_id_fk" FOREIGN KEY ("payment_document_id") REFERENCES "public"."procurement_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_payment_allocations" ADD CONSTRAINT "supplier_payment_allocations_invoice_document_id_procurement_documents_id_fk" FOREIGN KEY ("invoice_document_id") REFERENCES "public"."procurement_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "materials_archived_name_idx" ON "materials" USING btree ("archived","name");--> statement-breakpoint
CREATE INDEX "procurement_documents_project_status_date_idx" ON "procurement_documents" USING btree ("project_id","status","business_date");--> statement-breakpoint
CREATE INDEX "procurement_documents_supplier_status_date_idx" ON "procurement_documents" USING btree ("supplier_id","status","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "procurement_documents_reversal_of_uq" ON "procurement_documents" USING btree ("reversal_of_id");--> statement-breakpoint
CREATE INDEX "procurement_lines_document_idx" ON "procurement_lines" USING btree ("document_id");--> statement-breakpoint
CREATE INDEX "procurement_lines_material_idx" ON "procurement_lines" USING btree ("material_id");--> statement-breakpoint
CREATE INDEX "procurement_lines_source_idx" ON "procurement_lines" USING btree ("source_line_id");--> statement-breakpoint
CREATE INDEX "stock_movements_project_material_order_idx" ON "stock_movements" USING btree ("project_id","material_id","posting_order");--> statement-breakpoint
CREATE INDEX "stock_movements_document_idx" ON "stock_movements" USING btree ("document_id");