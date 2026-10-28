import { createHash } from "node:crypto";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import { DraftCreateCommandSchema } from "@sazeh/contracts";
import * as schema from "../src/db/schema.js";
import { commandReceipts, noteDrafts } from "../src/db/schema.js";
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
    const command = DraftCreateCommandSchema.parse({
      protocolVersion: 1,
      commandId: "00000000-0000-4000-8000-000000000002",
      entityId: "00000000-0000-4000-8000-000000000001",
      expectedVersion: 0,
      kind: "CREATE_NOTE_DRAFT",
      text: "Synthetic M0 seed: site delivery note",
    });
    const requestHash = createHash("sha256")
      .update(
        JSON.stringify({
          protocolVersion: command.protocolVersion,
          entityId: command.entityId,
          expectedVersion: command.expectedVersion,
          kind: command.kind,
          text: command.text,
        }),
      )
      .digest("hex");
    const draftId = await db.transaction(async (tx) => {
      const [receipt] = await tx
        .select()
        .from(commandReceipts)
        .where(eq(commandReceipts.commandId, command.commandId))
        .limit(1);
      if (receipt && receipt.canonicalRequestHash !== requestHash)
        throw new Error("The legacy seed command ID was reused with different content");
      const [existing] = await tx
        .select()
        .from(noteDrafts)
        .where(eq(noteDrafts.id, command.entityId))
        .limit(1);
      if (receipt && !existing) throw new Error("The legacy seed receipt exists without its draft");
      if (existing && (existing.text !== command.text || existing.authorUserId !== null)) {
        throw new Error("The legacy seed draft ID belongs to different or attributed content");
      }
      const createdAt = existing?.createdAt ?? new Date();
      if (!existing) {
        await tx
          .insert(noteDrafts)
          .values({ id: command.entityId, text: command.text, authorUserId: null, createdAt });
      }
      if (!receipt) {
        const response = {
          protocolVersion: 1,
          commandId: command.commandId,
          draft: {
            id: command.entityId,
            text: command.text,
            version: 1,
            status: "DRAFT",
            createdAt: createdAt.toISOString(),
          },
          replayed: false,
        };
        await tx.insert(commandReceipts).values({
          commandId: command.commandId,
          canonicalRequestHash: requestHash,
          resultSnapshot: response,
        });
      }
      return command.entityId;
    });
    process.stdout.write(`Synthetic legacy M0 draft ready (${draftId}); owner remains unset.\n`);
  } finally {
    await client.end({ timeout: 5 });
  }
}

void main();
