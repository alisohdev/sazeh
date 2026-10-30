import { FinanceReportService } from "./finance/report.service.js";
import { AttachmentsController } from "./attachments/attachments.controller.js";
import { FinanceController } from "./finance/finance.controller.js";
import { FinanceService } from "./finance/finance.service.js";
import { Module } from "@nestjs/common";
import { DatabaseModule } from "./db/database.module.js";
import { DraftsController } from "./drafts/drafts.controller.js";
import { HealthController } from "./health/health.controller.js";
import { IdentityModule } from "./identity/identity.module.js";
import { DirectoriesController } from "./directories/directories.controller.js";
import { DirectoryService } from "./directories/directory.service.js";
import { WorkforceController } from "./workforce/workforce.controller.js";
import { WorkforceService } from "./workforce/workforce.service.js";
import { ProcurementController } from "./procurement/procurement.controller.js";
import { ProcurementService } from "./procurement/procurement.service.js";

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [
    AttachmentsController,
    FinanceController,
    DraftsController,
    HealthController,
    DirectoriesController,
    WorkforceController,
    ProcurementController,
  ],
  providers: [
    FinanceReportService,
    FinanceService,
    DirectoryService,
    WorkforceService,
    ProcurementService,
  ],
})
export class AppModule {}
