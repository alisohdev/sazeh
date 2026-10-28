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
    authorUserId: z.uuid(),
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
  syncState:
    | "PENDING"
    | "SENDING"
    | "SYNCED"
    | "AUTH_REQUIRED"
    | "CONFLICT"
    | "VALIDATION_FAILED"
    | "RETRY_PENDING";
  problem?: string;
};

export const UsernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,80}$/);
export const PasswordSchema = z.string().min(14).max(256);
export const LoginSchema = z
  .object({ username: UsernameSchema, password: z.string().min(1).max(256) })
  .strict();
export const ChangePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(256), newPassword: PasswordSchema })
  .strict();
export const CreateAdminSchema = z
  .object({ username: UsernameSchema, displayName: z.string().trim().min(1).max(160) })
  .strict();
export const ResetPasswordSchema = z.object({}).strict();
export const AdminStatusSchema = z.object({ active: z.boolean() }).strict();
export const UserSchema = z
  .object({
    id: z.uuid(),
    username: UsernameSchema,
    displayName: z.string(),
    role: z.enum(["SUPERUSER", "ADMIN"]),
    active: z.boolean(),
    mustChangePassword: z.boolean(),
  })
  .strict();
export const SessionResponseSchema = z
  .object({
    accessToken: z.string().min(1),
    expiresAt: z.number().int(),
    user: UserSchema,
  })
  .strict();
export type User = z.infer<typeof UserSchema>;
export type SessionResponse = z.infer<typeof SessionResponseSchema>;
export const TemporaryCredentialSchema = z
  .object({
    admin: UserSchema,
    temporaryPassword: z.string().min(14),
  })
  .strict();
