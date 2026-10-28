import { eq, sql } from "drizzle-orm";
import type { Database } from "../db/database.module.js";
import { users } from "../db/schema.js";

export type SuperuserInput = {
  username: string;
  displayName: string;
  passwordHash: string;
};

export async function createSuperuser(db: Database, input: SuperuserInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('sazeh:m0:superuser-bootstrap'))`);
    const [existingSuperuser] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "SUPERUSER"))
      .limit(1);
    if (existingSuperuser) {
      throw new Error("A superuser already exists; bootstrap can run only once");
    }
    await tx.insert(users).values({
      username: input.username,
      displayName: input.displayName,
      passwordHash: input.passwordHash,
      role: "SUPERUSER",
      active: true,
      mustChangePassword: false,
      credentialVersion: 1,
    });
  });
}
