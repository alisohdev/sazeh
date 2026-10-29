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

const UuidSchema = z.uuid();
const DateOnlySchema = z.iso.date();
const TomanSchema = z.string().regex(/^(0|[1-9][0-9]*)$/, "Use a whole toman amount");

export const ContactSchema = z.object({
  id: UuidSchema,
  displayName: z.string().min(1).max(160),
  phone: z.string().max(40).nullable(),
  isWorker: z.boolean(),
  isSupplier: z.boolean(),
  isOwner: z.boolean(),
  archived: z.boolean(),
  version: z.number().int().positive(),
});
export const ContactInputSchema = ContactSchema.omit({ id: true, archived: true, version: true });
export const ProjectSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(160),
  ownerContactId: UuidSchema.nullable(),
  startsOn: DateOnlySchema.nullable(),
  endsOn: DateOnlySchema.nullable(),
  lifecycle: z.enum(["ACTIVE", "ARCHIVED"]),
  archiveReason: z.string().nullable(),
  contractInitialToman: TomanSchema,
  version: z.number().int().positive(),
});
export const ProjectInputSchema = ProjectSchema.omit({
  id: true,
  lifecycle: true,
  archiveReason: true,
  version: true,
}).superRefine((value, context) => {
  if (value.startsOn && value.endsOn && value.endsOn < value.startsOn)
    context.addIssue({
      code: "custom",
      path: ["endsOn"],
      message: "Project end date must not precede its start date",
    });
});
export const EngagementSchema = z.object({
  id: UuidSchema,
  workerId: UuidSchema,
  projectId: UuidSchema,
  type: z.enum(["DAILY", "HOURLY", "QUANTITY", "MONTHLY", "FIXED_CONTRACT", "MANUAL"]),
  defaultRateToman: TomanSchema,
  startsOn: DateOnlySchema,
  endsOn: DateOnlySchema.nullable(),
  archived: z.boolean(),
  version: z.number().int().positive(),
});
export const EngagementInputSchema = EngagementSchema.omit({
  id: true,
  archived: true,
  version: true,
}).superRefine((v, ctx) => {
  if (v.endsOn && v.endsOn < v.startsOn)
    ctx.addIssue({
      code: "custom",
      path: ["endsOn"],
      message: "End date must not precede start date",
    });
});
export const ProjectBudgetSchema = z.object({
  id: UuidSchema,
  projectId: UuidSchema,
  category: z.string().min(1).max(100),
  amountToman: TomanSchema,
  baselineToman: TomanSchema,
  version: z.number().int().positive(),
});
export const DirectoryCommandSchema = z
  .object({
    commandId: UuidSchema,
    entityId: UuidSchema,
    expectedVersion: z.number().int().nonnegative(),
    kind: z.enum([
      "PROJECT_CREATE",
      "PROJECT_UPDATE",
      "PROJECT_LIFECYCLE",
      "CONTACT_CREATE",
      "CONTACT_UPDATE",
      "CONTACT_LIFECYCLE",
      "ENGAGEMENT_CREATE",
      "ENGAGEMENT_UPDATE",
      "BUDGET_SET",
    ]),
    payload: z.record(z.string(), z.unknown()),
  })
  .strict();
export const DirectoryAcknowledgementSchema = z.object({
  protocolVersion: z.literal(1),
  commandId: UuidSchema,
  entity: z.unknown(),
  revision: z.string(),
  replayed: z.boolean(),
});
export const DirectoryBootstrapItemSchema = z.object({
  entityType: z.enum(["PROJECT", "CONTACT", "ENGAGEMENT", "BUDGET"]),
  entity: z.record(z.string(), z.unknown()),
});
export const DirectoryBootstrapSchema = z.object({
  protocolVersion: z.literal(1),
  snapshotId: UuidSchema,
  cursor: z.string().regex(/^\d+$/),
  items: z.array(DirectoryBootstrapItemSchema),
  nextCursor: z.string().nullable(),
});
export const DirectoryChangesSchema = z.object({
  changes: z.array(
    z.object({
      revision: z.number().int().positive(),
      entityType: z.enum(["PROJECT", "CONTACT", "ENGAGEMENT", "BUDGET"]),
      entityId: UuidSchema,
      snapshot: z.record(z.string(), z.unknown()),
    }),
  ),
  cursor: z.string().regex(/^\d+$/),
  highWatermark: z.string().regex(/^\d+$/),
  hasMore: z.boolean(),
});
export type Contact = z.infer<typeof ContactSchema>;
export type Project = z.infer<typeof ProjectSchema>;
export type Engagement = z.infer<typeof EngagementSchema>;
export type ProjectBudget = z.infer<typeof ProjectBudgetSchema>;
export type DirectoryCommand = z.infer<typeof DirectoryCommandSchema>;
export type DirectoryAcknowledgement = z.infer<typeof DirectoryAcknowledgementSchema>;
export type DirectoryBootstrap = z.infer<typeof DirectoryBootstrapSchema>;
export type DirectoryChanges = z.infer<typeof DirectoryChangesSchema>;
export const TemporaryCredentialSchema = z
  .object({
    admin: UserSchema,
    temporaryPassword: z.string().min(14),
  })
  .strict();
