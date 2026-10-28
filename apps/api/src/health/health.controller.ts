import { Controller, Get, HttpException, HttpStatus, Inject } from "@nestjs/common";
import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { HealthSchema } from "@sazeh/contracts";
import { sql } from "drizzle-orm";
import { DATABASE, type Database } from "../db/database.module.js";
import { createS3Client, storageSettingsFromEnvironment } from "../storage/s3.js";

@Controller("health")
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  async ready() {
    let database: "ok" | "unavailable" = "ok";
    let storage: "ok" | "unavailable" | "not_configured" = "not_configured";

    try {
      await this.db.execute(sql`select 1`);
    } catch {
      database = "unavailable";
    }

    try {
      const settings = storageSettingsFromEnvironment();
      if (settings) {
        const client = createS3Client(settings);
        try {
          await client.send(new HeadBucketCommand({ Bucket: settings.bucket }));
        } finally {
          client.destroy();
        }
        storage = "ok";
      }
    } catch {
      storage = "unavailable";
    }

    const result = HealthSchema.parse({
      status: database === "ok" && storage !== "unavailable" ? "ok" : "degraded",
      dependencies: { database, storage },
    });
    if (result.status !== "ok") {
      throw new HttpException(result, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return result;
  }
}
