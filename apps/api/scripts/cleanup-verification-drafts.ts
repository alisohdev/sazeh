import { sql } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema.js";
import { commandReceipts, noteDrafts } from "../src/db/schema.js";

async function main(): Promise<void> {
  if (process.env.APP_ENV !== "local") {
    throw new Error("Verification cleanup is allowed only when APP_ENV=local");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const client = postgres(url, { max: 1 });
  const proofPrefix = "M0_BROWSER_PROOF::";
  try {
    const db = drizzle(client, { schema });
    await db.transaction(async (tx) => {
      const testDrafts = await tx
        .select({ id: noteDrafts.id })
        .from(noteDrafts)
        .where(sql`left(${noteDrafts.text}, ${proofPrefix.length}) = ${proofPrefix}`);
      for (const draft of testDrafts) {
        await tx
          .delete(commandReceipts)
          .where(sql`${commandReceipts.resultSnapshot}->'draft'->>'id' = ${draft.id}`);
      }
      await tx
        .delete(noteDrafts)
        .where(sql`left(${noteDrafts.text}, ${proofPrefix.length}) = ${proofPrefix}`);
    });
    process.stdout.write("Browser verification drafts and their command receipts were removed.\n");
  } finally {
    await client.end({ timeout: 5 });
  }
}

void main();
