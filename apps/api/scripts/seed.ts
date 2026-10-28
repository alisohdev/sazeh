import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema.js";
import { createDraft } from "../src/drafts/create-draft.js";
import type { Database } from "../src/db/database.module.js";

async function main(): Promise<void> {
  if (process.env.APP_ENV !== "local") {
    throw new Error("Synthetic seed is allowed only when APP_ENV=local");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const client = postgres(url, { max: 1 });
  try {
    const db = drizzle(client, { schema }) as Database;
    const result = await createDraft(db, {
      protocolVersion: 1,
      commandId: "00000000-0000-4000-8000-000000000002",
      entityId: "00000000-0000-4000-8000-000000000001",
      expectedVersion: 0,
      kind: "CREATE_NOTE_DRAFT",
      text: "Synthetic M0 seed: site delivery note",
    });
    process.stdout.write(`Synthetic draft ready (${result.draft.id}).\n`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

void main();
