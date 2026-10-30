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
  ProcurementFinalizeCommandSchema,
  ProcurementSaveCommandSchema,
  ProcurementReportFilterSchema,
  ProcurementReverseCommandSchema,
} from "@sazeh/contracts";
import { ZodError } from "zod";
import type { AuthenticatedRequest } from "../identity/access.guard.js";
import type { Principal } from "../identity/identity.service.js";
import { ProcurementService } from "./procurement.service.js";

@Controller("v1/procurement")
export class ProcurementController {
  constructor(@Inject(ProcurementService) private readonly procurement: ProcurementService) {}
  @Post("drafts")
  draft(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.save(body, request, "DOCUMENT_UPSERT");
  }
  @Post("materials")
  material(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.save(body, request, "MATERIAL_UPSERT");
  }
  @Post("materials/:id/lifecycle")
  lifecycle(@Param("id") id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    return this.save({ ...(body as object), entityId: id }, request, "MATERIAL_LIFECYCLE");
  }
  private save(body: unknown, request: AuthenticatedRequest, kind: string) {
    const command = ProcurementSaveCommandSchema.safeParse(body);
    if (!command.success || command.data.commandType !== kind)
      throw new BadRequestException({
        code: "INVALID_COMMAND",
        message: "Procurement command is invalid",
      });
    return this.procurement.save(principal(request), command.data);
  }

  @Get("materials")
  materials(@Query("archived") archived?: string) {
    if (archived !== undefined && archived !== "true" && archived !== "false")
      throw new BadRequestException({
        code: "INVALID_FILTER",
        message: "Archived filter is invalid",
      });
    return this.procurement.materials(archived === undefined ? undefined : archived === "true");
  }

  @Post("drafts/:id/finalize")
  finalize(@Param("id") id: string, @Body() body: unknown, @Req() request: AuthenticatedRequest) {
    try {
      return this.procurement.finalize(
        principal(request),
        ProcurementFinalizeCommandSchema.parse({ ...(body as object), recordId: id }),
      );
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
      return this.procurement.reverse(
        principal(request),
        ProcurementReverseCommandSchema.parse({ ...(body as object), recordId: id }),
      );
    } catch (error) {
      if (error instanceof ZodError)
        throw new BadRequestException({
          code: "INVALID_REVERSAL",
          message: "Reversal command and reason are required",
        });
      throw error;
    }
  }

  @Get("report")
  report(
    @Query("projectId") projectId?: string,
    @Query("supplierId") supplierId?: string,
    @Query("materialId") materialId?: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
  ) {
    try {
      const filter = ProcurementReportFilterSchema.parse({
        projectId,
        supplierId,
        materialId,
        from,
        to,
      });
      if (filter.from && filter.to && filter.from > filter.to)
        throw new BadRequestException({
          code: "INVALID_DATE_RANGE",
          message: "Start date must not follow end date",
        });
      return this.procurement.report(filter);
    } catch (error) {
      if (error instanceof ZodError)
        throw new BadRequestException({
          code: "INVALID_FILTER",
          message: "Report filter is invalid",
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
