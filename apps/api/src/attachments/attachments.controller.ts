import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
  ServiceUnavailableException,
} from "@nestjs/common";
import { AttachmentTicketSchema } from "@sazeh/contracts";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { DATABASE, type Database } from "../db/database.module.js";
import { attachments, businessAudit, financeRecords } from "../db/schema.js";
import type { AuthenticatedRequest } from "../identity/access.guard.js";
import { claimsFor, requireLiveSession } from "../identity/identity.service.js";
import { createS3Client, storageSettingsFromEnvironment } from "../storage/s3.js";
const idSchema = z.uuid();
@Controller("v1/attachments")
export class AttachmentsController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}
  @Get("record/:id") async list(@Param("id") id: string) {
    if (!idSchema.safeParse(id).success) throw new BadRequestException();
    return this.db
      .select({
        id: attachments.id,
        filename: attachments.filename,
        state: attachments.state,
        size: attachments.size,
      })
      .from(attachments)
      .where(eq(attachments.recordId, id));
  }
  @Post("upload-ticket") async ticket(@Body() raw: unknown, @Req() req: AuthenticatedRequest) {
    const parsed = AttachmentTicketSchema.safeParse(raw);
    if (!parsed.success) throw new BadRequestException("Invalid file");
    const input = parsed.data;
    const { settings, client } = storage();
    const actor = principal(req);
    const file = await this.db.transaction(async (tx) => {
      await requireLiveSession(tx, claimsFor(actor), false, "share");
      const [parent] = await tx
        .select()
        .from(financeRecords)
        .where(eq(financeRecords.id, input.recordId))
        .for("update");
      if (!parent) throw new NotFoundException();
      const [existing] = await tx.select().from(attachments).where(eq(attachments.id, input.id));
      if (existing) {
        if (
          existing.createdBy !== actor.userId ||
          existing.recordId !== input.recordId ||
          existing.filename !== input.filename ||
          existing.size !== input.size ||
          existing.mediaType !== input.mediaType
        )
          throw new ConflictException("Attachment identity conflict");
        return existing;
      }
      if (parent.reversalOfId || parent.status === "REVERSED")
        throw new ConflictException("Evidence must be queued before posting");
      const files = await tx.select().from(attachments).where(eq(attachments.recordId, parent.id));
      if (files.length >= 5) throw new ConflictException("Five files maximum");
      const [row] = await tx
        .insert(attachments)
        .values({ ...input, createdBy: actor.userId, objectKey: "private/" + input.id })
        .returning();
      if (!row) throw new Error("Missing attachment");
      await tx.insert(businessAudit).values({
        actorUserId: actor.userId,
        actorSessionId: actor.sessionId,
        entityType: "ATTACHMENT",
        entityId: row.id,
        action: "STAGE",
        afterValue: row,
      });
      return row;
    });
    if (file.state === "READY") return { id: file.id, state: "READY" };
    return {
      id: file.id,
      state: file.state,
      url: await getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: settings.bucket,
          Key: file.objectKey,
          ContentType: file.mediaType,
          ContentLength: file.size,
        }),
        { expiresIn: 120 },
      ),
      expiresIn: 120,
    };
  }
  @Post(":id/complete") async complete(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    const file = await this.file(id);
    const actor = principal(req);
    if (file.createdBy !== actor.userId) throw new NotFoundException();
    if (file.state === "READY") return { id, state: "READY" };
    const { settings, client } = storage();
    const object = await client.send(
      new GetObjectCommand({ Bucket: settings.bucket, Key: file.objectKey }),
    );
    if (object.ContentLength !== file.size || object.ContentType !== file.mediaType || !object.Body)
      throw new BadRequestException("File size or type mismatch");
    const bytes = await object.Body.transformToByteArray();
    if (bytes.length !== file.size || !validMagic(bytes, file.mediaType))
      throw new BadRequestException("File content mismatch");
    const readyKey = "ready/" + id;
    return this.db.transaction(async (tx) => {
      await requireLiveSession(tx, claimsFor(actor), false, "share");
      const [current] = await tx
        .select()
        .from(attachments)
        .where(eq(attachments.id, id))
        .for("update");
      if (!current) throw new NotFoundException();
      if (current.state !== "READY") {
        await client.send(
          new PutObjectCommand({
            Bucket: settings.bucket,
            Key: readyKey,
            Body: bytes,
            ContentType: file.mediaType,
          }),
        );

        await tx
          .update(attachments)
          .set({ state: "READY", objectKey: readyKey })
          .where(eq(attachments.id, id));
        await tx.insert(businessAudit).values({
          actorUserId: actor.userId,
          actorSessionId: actor.sessionId,
          entityType: "ATTACHMENT",
          entityId: id,
          action: "READY",
          afterValue: { id, state: "READY" },
        });
      }
      return { id, state: "READY" };
    });
  }
  @Get(":id/download") async download(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    const file = await this.file(id);
    if (file.state !== "READY") throw new ConflictException("File unavailable");
    const actor = principal(req),
      { settings, client } = storage();
    await this.db.transaction(async (tx) => {
      await requireLiveSession(tx, claimsFor(actor), false, "share");
      await tx.insert(businessAudit).values({
        actorUserId: actor.userId,
        actorSessionId: actor.sessionId,
        entityType: "ATTACHMENT",
        entityId: id,
        action: "DOWNLOAD",
        afterValue: { id },
      });
    });
    return {
      url: await getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: settings.bucket,
          Key: file.objectKey,
          ResponseContentDisposition: "attachment",
        }),
        { expiresIn: 60 },
      ),
    };
  }
  private async file(id: string) {
    if (!idSchema.safeParse(id).success) throw new BadRequestException();
    const [file] = await this.db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, id)));
    if (!file) throw new NotFoundException();
    return file;
  }
}
function principal(req: AuthenticatedRequest) {
  if (!req.principal || req.principal.kind !== "workspace") throw new BadRequestException();
  return req.principal;
}
function storage() {
  const settings = storageSettingsFromEnvironment();
  if (!settings) throw new ServiceUnavailableException("Storage not configured");
  return { settings, client: createS3Client(settings) };
}
export function validMagic(b: Uint8Array, type: string) {
  const hex = Buffer.from(b.subarray(0, 12)).toString("hex");
  if (type === "image/jpeg") return hex.startsWith("ffd8ff");
  if (type === "image/png") return hex.startsWith("89504e470d0a1a0a");
  if (type === "application/pdf") return hex.startsWith("255044462d");
  return hex.startsWith("52494646") && Buffer.from(b.subarray(8, 12)).toString() === "WEBP";
}
