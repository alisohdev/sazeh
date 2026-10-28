import { createHash } from "node:crypto";
import { ConflictException } from "@nestjs/common";
import { DraftAcknowledgementSchema, DraftCreateCommandSchema } from "@sazeh/contracts";
import type { DraftAcknowledgement, DraftCreateCommand } from "@sazeh/contracts";
import { eq } from "drizzle-orm";
import type { Database } from "../db/database.module.js";
import { commandReceipts, noteDrafts } from "../db/schema.js";

export async function createDraft(db: Database, input: unknown): Promise<DraftAcknowledgement> {
  const command = DraftCreateCommandSchema.parse(input);
  const requestHash = hashCommand(command);
  const createdAt = new Date().toISOString();
  const response = DraftAcknowledgementSchema.parse({
    protocolVersion: 1,
    commandId: command.commandId,
    draft: {
      id: command.entityId,
      text: command.text,
      version: 1,
      status: "DRAFT",
      createdAt,
    },
    replayed: false,
  });

  return db.transaction(async (tx) => {
    const [claimedReceipt] = await tx
      .insert(commandReceipts)
      .values({
        commandId: command.commandId,
        canonicalRequestHash: requestHash,
        resultSnapshot: response,
      })
      .onConflictDoNothing({ target: commandReceipts.commandId })
      .returning({ commandId: commandReceipts.commandId });

    if (!claimedReceipt) {
      const [receipt] = await tx
        .select()
        .from(commandReceipts)
        .where(eq(commandReceipts.commandId, command.commandId))
        .limit(1);
      if (!receipt) throw new Error("Command receipt disappeared after a uniqueness conflict");
      if (receipt.canonicalRequestHash !== requestHash) {
        throw new ConflictException({
          code: "COMMAND_ID_CONFLICT",
          message: "Command ID was used with different content",
        });
      }
      const saved = DraftAcknowledgementSchema.parse(receipt.resultSnapshot);
      return { ...saved, replayed: true };
    }

    const [createdDraft] = await tx
      .insert(noteDrafts)
      .values({
        id: command.entityId,
        text: command.text,
        version: 1,
        status: "DRAFT",
        createdAt: new Date(createdAt),
      })
      .onConflictDoNothing({ target: noteDrafts.id })
      .returning({ id: noteDrafts.id });
    if (!createdDraft) {
      throw new ConflictException({
        code: "DRAFT_ID_CONFLICT",
        message: "Draft ID already exists",
      });
    }

    return response;
  });
}

function hashCommand(command: DraftCreateCommand): string {
  const canonical = JSON.stringify({
    protocolVersion: command.protocolVersion,
    entityId: command.entityId,
    expectedVersion: command.expectedVersion,
    kind: command.kind,
    text: command.text,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
