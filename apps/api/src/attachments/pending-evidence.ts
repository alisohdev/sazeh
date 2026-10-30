import { ConflictException } from "@nestjs/common";
import { eq } from "drizzle-orm";
import type { Database } from "../db/database.module.js";
import { attachments } from "../db/schema.js";
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];
export async function requireReadyEvidence(tx: Tx, id: string, acknowledged?: boolean) {
  const files = await tx
    .select({ state: attachments.state })
    .from(attachments)
    .where(eq(attachments.recordId, id));
  if (files.some((f) => f.state !== "READY") && !acknowledged)
    throw new ConflictException({
      code: "PENDING_EVIDENCE",
      message: "Explicit pending evidence acknowledgement required",
    });
}
