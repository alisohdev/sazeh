ALTER TABLE note_drafts ADD COLUMN author_user_id uuid REFERENCES users(id);
--> statement-breakpoint
CREATE TABLE sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id), credential_version integer NOT NULL,
 expires_at timestamptz NOT NULL, revoked_at timestamptz, revocation_reason text,
 created_at timestamptz NOT NULL DEFAULT now(), last_used_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sessions_user_idx ON sessions(user_id);
--> statement-breakpoint
CREATE TABLE refresh_tokens (
 token_hash char(64) PRIMARY KEY, session_id uuid NOT NULL REFERENCES sessions(id), generation integer NOT NULL,
 issued_at timestamptz NOT NULL DEFAULT now(), consumed_at timestamptz,
 CONSTRAINT refresh_tokens_session_generation_uq UNIQUE(session_id, generation)
);
--> statement-breakpoint
CREATE TABLE login_buckets (key char(64) PRIMARY KEY, attempts integer NOT NULL, reset_at timestamptz NOT NULL);
--> statement-breakpoint
CREATE TABLE authenticated_command_receipts (
 user_id uuid NOT NULL REFERENCES users(id), command_id uuid NOT NULL,
 canonical_request_hash char(64) NOT NULL, result_snapshot jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id, command_id)
);
--> statement-breakpoint
CREATE TABLE account_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id uuid NOT NULL REFERENCES users(id),
 actor_session_id uuid NOT NULL REFERENCES sessions(id), target_user_id uuid NOT NULL REFERENCES users(id),
 action varchar(40) NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
