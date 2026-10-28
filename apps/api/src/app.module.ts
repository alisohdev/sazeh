import { Module } from "@nestjs/common";
import { DatabaseModule } from "./db/database.module.js";
import { DraftsController } from "./drafts/drafts.controller.js";
import { HealthController } from "./health/health.controller.js";

@Module({
  imports: [DatabaseModule],
  controllers: [DraftsController, HealthController],
})
export class AppModule {}
