import { input, password } from "@inquirer/prompts";
import argon2 from "argon2";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "../src/db/schema.js";
import { createSuperuser } from "../src/users/create-superuser.js";

async function main(): Promise<void> {
  if (process.env.APP_ENV !== "local") {
    throw new Error("Superuser bootstrap is allowed only when APP_ENV=local");
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const username = (await input({ message: "Superuser username" })).trim().toLowerCase();
  const displayName = (await input({ message: "Display name" })).trim();
  const secret = await password({ message: "Password (hidden, minimum 14 characters)" });
  if (!/^[a-z0-9._-]{3,80}$/.test(username)) {
    throw new Error(
      "Username must use 3–80 lowercase letters, digits, dots, underscores or hyphens",
    );
  }
  if (displayName.length < 1 || displayName.length > 160) {
    throw new Error("Display name must be between 1 and 160 characters");
  }
  if (secret.length < 14) throw new Error("Password must contain at least 14 characters");

  const passwordHash = await argon2.hash(secret, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  const client = postgres(url, { max: 1 });
  try {
    await createSuperuser(drizzle(client, { schema }), { username, displayName, passwordHash });
    process.stdout.write(
      "Superuser created. The password was not stored in plaintext or printed.\n",
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

void main();
