import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import {
  ContactInputSchema,
  DirectoryCommandSchema,
  EngagementInputSchema,
  ProjectInputSchema,
} from "@sazeh/contracts";
import type { AuthenticatedRequest } from "../identity/access.guard.js";
import { DirectoryService } from "./directory.service.js";

@Controller("v1")
export class DirectoriesController {
  constructor(@Inject(DirectoryService) private readonly directory: DirectoryService) {}

  @Get("projects")
  projects(
    @Query("archived") archived: string | undefined,
    @Query("cursor") cursor: string | undefined,
    @Query("limit") limit = "50",
  ) {
    const page = listPage(cursor, limit);
    return this.directory.listProjects(archived === "true", page.cursor, page.limit);
  }

  @Post("projects")
  createProject(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const payload = record(body);
    return this.directory.write(
      principal(req),
      "PROJECT_CREATE",
      uuid(),
      0,
      parse(ProjectInputSchema, payload),
    );
  }

  @Get("projects/:id")
  project(@Param("id") id: string) {
    return this.directory.project(id);
  }

  @Patch("projects/:id")
  updateProject(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const value = record(body);
    const expectedVersion = version(value);
    delete value.expectedVersion;
    return this.directory.write(
      principal(req),
      "PROJECT_UPDATE",
      id,
      expectedVersion,
      parse(ProjectInputSchema, value),
    );
  }

  @Post("projects/:id/lifecycle")
  lifecycle(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const value = record(body);
    const expectedVersion = version(value);
    delete value.expectedVersion;
    return this.directory.write(principal(req), "PROJECT_LIFECYCLE", id, expectedVersion, value);
  }

  @Get("contacts")
  contacts(
    @Query("role") role?: string,
    @Query("archived") archived?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit = "50",
  ) {
    if (role && !["worker", "supplier", "owner"].includes(role))
      throw new BadRequestException({
        code: "INVALID_ROLE_FILTER",
        message: "Unsupported contact filter",
      });
    const page = listPage(cursor, limit);
    return this.directory.listContacts(
      role as "worker" | "supplier" | "owner" | undefined,
      archived === "true",
      page.cursor,
      page.limit,
    );
  }

  @Post("contacts")
  createContact(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    return this.directory.write(
      principal(req),
      "CONTACT_CREATE",
      uuid(),
      0,
      parse(ContactInputSchema, body),
    );
  }

  @Patch("contacts/:id")
  updateContact(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const value = record(body);
    const expectedVersion = version(value);
    delete value.expectedVersion;
    return this.directory.write(
      principal(req),
      "CONTACT_UPDATE",
      id,
      expectedVersion,
      parse(ContactInputSchema, value),
    );
  }

  @Post("contacts/:id/lifecycle")
  contactLifecycle(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    const value = record(body);
    const expectedVersion = version(value);
    delete value.expectedVersion;
    return this.directory.write(principal(req), "CONTACT_LIFECYCLE", id, expectedVersion, value);
  }

  @Get("engagements")
  engagements(
    @Query("projectId") projectId?: string,
    @Query("workerId") workerId?: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limit = "50",
  ) {
    const page = listPage(cursor, limit);
    return this.directory.listEngagements(projectId, workerId, page.cursor, page.limit);
  }

  @Post("engagements")
  createEngagement(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    return this.directory.write(
      principal(req),
      "ENGAGEMENT_CREATE",
      uuid(),
      0,
      parse(EngagementInputSchema, body),
    );
  }

  @Patch("engagements/:id")
  updateEngagement(
    @Param("id") id: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    const value = record(body);
    const expectedVersion = version(value);
    delete value.expectedVersion;
    return this.directory.write(
      principal(req),
      "ENGAGEMENT_UPDATE",
      id,
      expectedVersion,
      parse(EngagementInputSchema, value),
    );
  }

  @Get("projects/:id/budgets")
  budgets(@Param("id") id: string, @Query("cursor") cursor?: string, @Query("limit") limit = "50") {
    const page = listPage(cursor, limit);
    return this.directory.budgets(id, page.cursor, page.limit);
  }

  @Put("projects/:id/budgets")
  setBudgets(@Param("id") id: string, @Body() body: unknown, @Req() req: AuthenticatedRequest) {
    if (!Array.isArray(body))
      throw new BadRequestException({
        code: "INVALID_BUDGETS",
        message: "Expected a budget array",
      });
    return this.directory.setBudgets(
      principal(req),
      id,
      body.map((item) => {
        const value = record(item);
        return {
          id: typeof value.id === "string" ? value.id : uuid(),
          category: String(value.category ?? ""),
          amountToman: String(value.amountToman ?? ""),
          expectedVersion: value.expectedVersion === undefined ? 0 : version(value),
        };
      }),
    );
  }

  @Post("sync/commands")
  async commands(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    if (!Array.isArray(body) || body.length > 100)
      throw new BadRequestException({
        code: "INVALID_COMMANDS",
        message: "Expected at most 100 directory commands",
      });
    const results = [];
    for (const entry of body) {
      try {
        results.push({
          ok: true,
          result: await this.directory.command(principal(req), DirectoryCommandSchema.parse(entry)),
        });
      } catch (error) {
        results.push({
          ok: false,
          commandId:
            typeof entry === "object" && entry && "commandId" in entry ? entry.commandId : null,
          status: status(error),
          error: problem(error),
        });
      }
    }
    return { results };
  }

  @Get("sync/bootstrap")
  bootstrap(
    @Query("snapshotId") snapshotId?: string,
    @Query("after") after?: string,
    @Query("limit") limit = "100",
  ) {
    if (!/^\d+$/.test(limit) || (after && !snapshotId))
      throw new BadRequestException({
        code: "INVALID_BOOTSTRAP_CURSOR",
        message: "Bootstrap page parameters are invalid",
      });
    return this.directory.bootstrap(snapshotId, after, Math.min(200, Math.max(1, Number(limit))));
  }

  @Get("sync/changes")
  changes(@Query("cursor") cursor = "0", @Query("limit") limit = "100") {
    if (!/^\d+$/.test(cursor) || !/^\d+$/.test(limit))
      throw new BadRequestException({
        code: "INVALID_CURSOR",
        message: "Cursor and limit must be integers",
      });
    return this.directory.changes(Number(cursor), Math.min(200, Math.max(1, Number(limit))));
  }
}

function parse<T extends { parse(input: unknown): unknown }>(
  schema: T,
  input: unknown,
): Record<string, unknown> {
  try {
    return schema.parse(input) as Record<string, unknown>;
  } catch {
    throw new BadRequestException({
      code: "INVALID_DIRECTORY_INPUT",
      message: "Directory fields are invalid",
    });
  }
}
function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new BadRequestException({ code: "INVALID_BODY", message: "Expected an object" });
  return { ...(value as Record<string, unknown>) };
}
function version(value: Record<string, unknown>) {
  if (!Number.isSafeInteger(value.expectedVersion) || Number(value.expectedVersion) < 0)
    throw new BadRequestException({
      code: "EXPECTED_VERSION_REQUIRED",
      message: "expectedVersion is required",
    });
  return Number(value.expectedVersion);
}
function listPage(cursor: string | undefined, limit: string) {
  if (!/^\d+$/.test(limit) || Number(limit) < 1)
    throw new BadRequestException({
      code: "INVALID_LIST_LIMIT",
      message: "List limit must be a positive integer",
    });
  return { cursor, limit: Math.min(200, Number(limit)) };
}
function principal(req: AuthenticatedRequest) {
  if (!req.principal)
    throw new BadRequestException({ code: "AUTH_REQUIRED", message: "Sign in to continue" });
  return req.principal;
}
function uuid() {
  return crypto.randomUUID();
}
function status(error: unknown) {
  return typeof error === "object" && error && "getStatus" in error
    ? (error as { getStatus(): number }).getStatus()
    : 422;
}
function problem(error: unknown) {
  return typeof error === "object" && error && "getResponse" in error
    ? (error as { getResponse(): unknown }).getResponse()
    : { code: "INVALID_COMMAND", message: "Command could not be applied" };
}
