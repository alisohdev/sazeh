import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  WorkforceFinalizeCommandSchema,
  WorkforceDraftCommandSchema,
  WorkforceReportFilterSchema,
  WorkforceReverseCommandSchema,
} from "@sazeh/contracts";
import { ZodError } from "zod";
import type { AuthenticatedRequest } from "../identity/access.guard.js";
import type { Principal } from "../identity/identity.service.js";
import { WorkforceService } from "./workforce.service.js";

@Controller("v1/workforce")
export class WorkforceController {
  constructor(@Inject(WorkforceService) private readonly workforce: WorkforceService) {}
  @Post("drafts")
  saveDraft(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = WorkforceDraftCommandSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: "INVALID_DRAFT",
        message: "Workforce draft is invalid",
      });
    return this.workforce.writeDraft(principal(request), parsed.data);
  }

  @Get("records")
  records(
    @Query("workerId") workerId: string,
    @Query("projectId") projectId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    try {
      const filter = WorkforceReportFilterSchema.parse({ workerId, projectId, from, to });
      if (filter.from && filter.to && filter.from > filter.to)
        throw new BadRequestException({
          code: "INVALID_DATE_RANGE",
          message: "Start date must not follow end date",
        });
      return this.workforce.list(filter);
    } catch (error) {
      if (error instanceof ZodError)
        throw new BadRequestException({
          code: "INVALID_FILTER",
          message: "Worker, project or date filter is invalid",
        });
      throw error;
    }
  }

  @Get("analytics")
  analytics(
    @Query("workerId") workerId?: string,
    @Query("projectId") projectId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    try {
      const filter = WorkforceReportFilterSchema.partial().parse({ workerId, projectId, from, to });
      if (filter.from && filter.to && filter.from > filter.to)
        throw new BadRequestException({
          code: "INVALID_DATE_RANGE",
          message: "Start date must not follow end date",
        });
      return this.workforce.analytics(filter);
    } catch (error) {
      if (error instanceof ZodError)
        throw new BadRequestException({
          code: "INVALID_FILTER",
          message: "Project, worker or date filter is invalid",
        });
      throw error;
    }
  }

  @Post("drafts/:id/finalize")
  finalize(@Param("id") id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    try {
      const command = WorkforceFinalizeCommandSchema.parse({ ...(body as object), recordId: id });
      return this.workforce.finalize(principal(request), command);
    } catch (error) {
      if (error instanceof ZodError)
        throw new BadRequestException({
          code: "INVALID_FINALIZATION",
          message: "Finalization command is invalid",
        });
      throw error;
    }
  }

  @Post("records/:id/reverse")
  reverse(@Param("id") id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    try {
      const command = WorkforceReverseCommandSchema.parse({ ...(body as object), recordId: id });
      return this.workforce.reverse(principal(request), command);
    } catch (error) {
      if (error instanceof ZodError)
        throw new BadRequestException({
          code: "INVALID_REVERSAL",
          message: "Reversal command and reason are required",
        });
      throw error;
    }
  }
}

function principal(request: AuthenticatedRequest): Principal {
  if (!request.principal)
    throw new BadRequestException({ code: "AUTH_REQUIRED", message: "Sign in to continue" });
  return request.principal;
}
