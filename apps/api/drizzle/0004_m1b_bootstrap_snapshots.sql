CREATE TABLE "directory_bootstrap_snapshots" (
	"id" uuid PRIMARY KEY NOT NULL,
	"revision" integer NOT NULL,
	"items" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
