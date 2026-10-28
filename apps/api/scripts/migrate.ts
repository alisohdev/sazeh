import { resolve } from "node:path";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "../src/db/schema.js";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required");
  const client = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(client, { schema }), { migrationsFolder: resolve("drizzle") });
    process.stdout.write("Database migrations are current.\n");
  } finally {
    await client.end({ timeout: 5 });
  }
}

void main();
