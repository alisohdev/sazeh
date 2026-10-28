import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { DatabaseModule } from "../db/database.module.js";
import { AccessGuard } from "./access.guard.js";
import { AdminsController, AuthController } from "./auth.controller.js";
import { IdentityService } from "./identity.service.js";

@Module({
  imports: [DatabaseModule],
  controllers: [AuthController, AdminsController],
  providers: [IdentityService, { provide: APP_GUARD, useClass: AccessGuard }],
  exports: [IdentityService],
})
export class IdentityModule {}
