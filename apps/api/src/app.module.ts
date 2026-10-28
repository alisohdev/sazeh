import { Module } from "@nestjs/common";
import { DatabaseModule } from "./db/database.module.js";
import { DraftsController } from "./drafts/drafts.controller.js";
import { HealthController } from "./health/health.controller.js";
import { IdentityModule } from "./identity/identity.module.js";

@Module({
  imports: [DatabaseModule, IdentityModule],
  controllers: [DraftsController, HealthController],
})
export class AppModule {}
