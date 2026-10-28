import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import * as schema from "../src/db/schema.js";
import { users } from "../src/db/schema.js";
import { createSuperuser } from "../src/users/create-superuser.js";

async function main(): Promise<void> {
  if (process.env.APP_ENV !== "local") {
    throw new Error("Bootstrap verification requires APP_ENV=local");
  }
  const adminUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!adminUrl) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL is required");

  const databaseName = `m0_bootstrap_${randomUUID().replaceAll("-", "")}`;
  const databaseUrl = new URL(adminUrl);
  databaseUrl.pathname = `/${databaseName}`;
  const admin = postgres(adminUrl, { max: 1 });
  let databaseCreated = false;

  try {
    await admin.unsafe(`create database "${databaseName}"`);
    databaseCreated = true;
    const client = postgres(databaseUrl.toString(), { max: 1 });
    try {
      const db = drizzle(client, { schema });
      await migrate(db, { migrationsFolder: resolve("drizzle") });

      const firstSecret = `${randomUUID()}${randomUUID()}`;
      const secondSecret = `${randomUUID()}${randomUUID()}`;
      const [firstHash, secondHash] = await Promise.all([
        argon2.hash(firstSecret, {
          type: argon2.argon2id,
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
        }),
        argon2.hash(secondSecret, {
          type: argon2.argon2id,
          memoryCost: 19_456,
          timeCost: 2,
          parallelism: 1,
        }),
      ]);
      const attempts = await Promise.allSettled([
        createSuperuser(db, {
          username: "m0-bootstrap-a",
          displayName: "Synthetic Bootstrap A",
          passwordHash: firstHash,
        }),
        createSuperuser(db, {
          username: "m0-bootstrap-b",
          displayName: "Synthetic Bootstrap B",
          passwordHash: secondHash,
        }),
      ]);
      assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
      assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1);

      const created = await db.select().from(users).where(eq(users.role, "SUPERUSER"));
      assert.equal(created.length, 1);
      const storedHash = created[0]!.passwordHash;
      const validHash =
        (await argon2.verify(storedHash, firstSecret).catch(() => false)) ||
        (await argon2.verify(storedHash, secondSecret).catch(() => false));
      assert(validHash, "only a valid Argon2id hash should be stored");
      assert.notEqual(storedHash, firstSecret);
      assert.notEqual(storedHash, secondSecret);
    } finally {
      await client.end({ timeout: 5 });
    }
    process.stdout.write(
      "Bootstrap verification passed: one concurrent superuser is created and only its Argon2id hash is stored.\n",
    );
  } finally {
    await admin.end({ timeout: 5 });
    if (databaseCreated) {
      const cleanup = postgres(adminUrl, { max: 1 });
      try {
        await cleanup.unsafe(`drop database if exists "${databaseName}"`);
      } finally {
        await cleanup.end({ timeout: 5 });
      }
    }
  }
}

void main();
