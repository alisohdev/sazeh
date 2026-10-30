import { FinanceReportService, csvCell } from "./report.service.js";
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Query,
} from "@nestjs/common";
import {
  CombinedFinanceFilterSchema,
  FinanceDecisionSchema,
  FinanceDraftSchema,
  FinanceActionSchema,
  FinanceReverseSchema,
  FinanceFilterSchema,
} from "@sazeh/contracts";
import type { AuthenticatedRequest } from "../identity/access.guard.js";
import { FinanceService } from "./finance.service.js";
import type { z } from "zod";
@Controller("v1/finance")
export class FinanceController {
  constructor(
    @Inject(FinanceService) private readonly service: FinanceService,
    @Inject(FinanceReportService) private readonly reports: FinanceReportService,
  ) {}
  @Get("report") report(
    @Query("projectId") projectId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("contactId") contactId?: string,
  ) {
    return this.reports.report(
      parse(CombinedFinanceFilterSchema, { projectId, contactId, from, to }),
    );
  }
  @Get("export") async export(
    @Query("projectId") projectId: string,
    @Query("from") from?: string,
    @Query("to") to?: string,
    @Query("contactId") contactId?: string,
  ) {
    const report = await this.reports.report(
      parse(CombinedFinanceFilterSchema, { projectId, contactId, from, to }),
    );
    const columns = [
      "id",
      "date",
      "kind",
      "category",
      "cost",
      "cashIn",
      "cashOut",
      "revenue",
    ] as const;
    return {
      filters: report.filters,
      asOf: report.asOf,
      totals: report.totals,
      csv:
        "\ufeff" +
        [
          columns.join(","),
          ...report.entries.map((r) => columns.map((c) => csvCell(r[c])).join(",")),
        ].join("\r\n"),
    };
  }
  @Get("records") list(@Query("projectId") projectId: string) {
    const f = parse(FinanceFilterSchema, { projectId });
    return this.service.list(f.projectId);
  }
  @Post("decision") decision(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    return this.service.decision(actor(req), parse(FinanceDecisionSchema, body));
  }
  @Post("draft") save(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    return this.service.save(actor(req), parse(FinanceDraftSchema, body));
  }
  @Post("finalize") finalize(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    return this.service.finalize(actor(req), parse(FinanceActionSchema, body));
  }
  @Post("reverse") reverse(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    return this.service.reverse(actor(req), parse(FinanceReverseSchema, body));
  }
}
function actor(r: AuthenticatedRequest) {
  if (!r.principal) throw new BadRequestException();
  return r.principal;
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({ code: "INVALID_FINANCE_COMMAND", issues: result.error.issues });
  return result.data;
}
