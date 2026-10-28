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
} from "@nestjs/common";
import { DraftCreateCommandSchema } from "@sazeh/contracts";
import { eq } from "drizzle-orm";
import { ZodError } from "zod";
import { DATABASE, type Database } from "../db/database.module.js";
import { noteDrafts } from "../db/schema.js";
import { createDraft } from "./create-draft.js";

@Controller("v1/drafts")
export class DraftsController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Post()
  async create(@Body() body: unknown) {
    if (process.env.APP_ENV !== "local" && process.env.APP_ENV !== "preview") {
      throw new ForbiddenException({
        code: "AUTH_REQUIRED",
        message: "Draft creation requires an authenticated account",
      });
    }
    try {
      return await createDraft(this.db, DraftCreateCommandSchema.parse(body));
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

  @Get(":id")
  async read(@Param("id") id: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      throw new BadRequestException({ code: "INVALID_ID", message: "Draft ID must be a UUID" });
    }
    const [draft] = await this.db.select().from(noteDrafts).where(eq(noteDrafts.id, id)).limit(1);
    if (!draft)
      throw new NotFoundException({ code: "DRAFT_NOT_FOUND", message: "Draft was not found" });
    return {
      id: draft.id,
      text: draft.text,
      version: draft.version,
      status: draft.status,
      createdAt: draft.createdAt.toISOString(),
    };
  }
}
