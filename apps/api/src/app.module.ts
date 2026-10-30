import { Module } from "@nestjs/common";
import { DatabaseModule } from "./db/database.module.js";
import { DraftsController } from "./drafts/drafts.controller.js";
import { HealthController } from "./health/health.controller.js";
import { IdentityModule } from "./identity/identity.module.js";
import { DirectoriesController } from "./directories/directories.controller.js";
import { DirectoryService } from "./directories/directory.service.js";
import { WorkforceController } from "./workforce/workforce.controller.js";
import { WorkforceService } from "./workforce/workforce.service.js";

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [DraftsController, HealthController, DirectoriesController, WorkforceController],
  providers: [DirectoryService, WorkforceService],
})
export class AppModule {}
