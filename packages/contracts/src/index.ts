import { z } from "zod";

export const DraftCreateCommandSchema = z
  .object({
    protocolVersion: z.literal(1),
    commandId: z.uuid(),
    entityId: z.uuid(),
    expectedVersion: z.literal(0),
    kind: z.literal("CREATE_NOTE_DRAFT"),
    text: z.string().trim().min(1).max(4000),
  })
  .strict();

export const ServerDraftSchema = z
  .object({
    id: z.uuid(),
    text: z.string().min(1).max(4000),
    version: z.literal(1),
    status: z.literal("DRAFT"),
    createdAt: z.iso.datetime(),
  })
  .strict();

export const DraftAcknowledgementSchema = z
  .object({
    protocolVersion: z.literal(1),
    commandId: z.uuid(),
    draft: ServerDraftSchema,
    replayed: z.boolean(),
  })
  .strict();

export const HealthSchema = z
  .object({
    status: z.enum(["ok", "degraded"]),
    dependencies: z.object({
      database: z.enum(["ok", "unavailable"]),
      storage: z.enum(["ok", "unavailable", "not_configured"]),
    }),
  })
  .strict();

export type DraftCreateCommand = z.infer<typeof DraftCreateCommandSchema>;
export type ServerDraft = z.infer<typeof ServerDraftSchema>;
export type DraftAcknowledgement = z.infer<typeof DraftAcknowledgementSchema>;

export type DraftView = {
  id: string;
  text: string;
  savedAt: string;
  syncState: "PENDING" | "SENDING" | "SYNCED" | "ERROR";
};
