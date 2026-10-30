import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import { DraftCreateCommandSchema } from "@sazeh/contracts";
import { and, desc, eq } from "drizzle-orm";
import { ZodError } from "zod";
import { DATABASE, type Database } from "../db/database.module.js";
import { noteDrafts } from "../db/schema.js";
import type { AuthenticatedRequest } from "../identity/access.guard.js";
import { createDraft } from "./create-draft.js";

@Controller("v1/drafts")
export class DraftsController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Post()
  async create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    try {
      return await createDraft(
        this.db,
        requirePrincipal(request),
        DraftCreateCommandSchema.parse(body),
      );
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          code: "INVALID_COMMAND",
          message: "Draft command is invalid",
        });
      }
      throw error;
    }
  }

  @Get("project/:projectId")
  async listForProject(
    @Param("projectId") projectId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId)) {
      throw new BadRequestException({ code: "INVALID_ID", message: "Project ID must be a UUID" });
    }
    const principal = requirePrincipal(request);
    const drafts = await this.db
      .select()
      .from(noteDrafts)
      .where(
        and(eq(noteDrafts.projectId, projectId), eq(noteDrafts.authorUserId, principal.userId)),
      )
      .orderBy(desc(noteDrafts.createdAt));
    return drafts.map((draft) => ({
      id: draft.id,
      authorUserId: draft.authorUserId,
      projectId: draft.projectId,
      text: draft.text,
      version: draft.version,
      status: draft.status,
      createdAt: draft.createdAt.toISOString(),
    }));
  }

  @Get(":id")
  async read(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException({ code: "INVALID_ID", message: "Draft ID must be a UUID" });
    }
    const [draft] = await this.db
      .select()
      .from(noteDrafts)
      .where(
        and(eq(noteDrafts.id, id), eq(noteDrafts.authorUserId, requirePrincipal(request).userId)),
      )
      .limit(1);
    if (!draft)
      throw new NotFoundException({ code: "DRAFT_NOT_FOUND", message: "Draft was not found" });
    return {
      id: draft.id,
      authorUserId: draft.authorUserId,
      projectId: draft.projectId,
      text: draft.text,
      version: draft.version,
      status: draft.status,
      createdAt: draft.createdAt.toISOString(),
    };
  }
}

function requirePrincipal(request: AuthenticatedRequest) {
  if (!request.principal || request.principal.kind !== "workspace") {
    throw new ForbiddenException({
      code: "PASSWORD_CHANGE_REQUIRED",
      message: "Change your password first",
    });
  }
  return request.principal;
}
