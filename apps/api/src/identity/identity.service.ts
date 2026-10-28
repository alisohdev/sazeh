import { createHash, randomUUID } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { type User, UserSchema, type SessionResponse } from "@sazeh/contracts";
import argon2 from "argon2";
import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { DATABASE, type Database } from "../db/database.module.js";
import { accountAudit, loginBuckets, refreshTokens, sessions, users } from "../db/schema.js";
import { opaqueToken, SESSION_SECONDS, signAccess, verifyAccess, type Claims } from "./tokens.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type QueryDatabase = Database | Transaction;
export type Principal = Readonly<{
  kind: "workspace" | "password-change";
  userId: string;
  sessionId: string;
  credentialVersion: number;
  role: User["role"];
}>;
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const userFields = {
  id: users.id,
  username: users.username,
  displayName: users.displayName,
  role: users.role,
  active: users.active,
  mustChangePassword: users.mustChangePassword,
};
export const hashPassword = (password: string) =>
  argon2.hash(password, { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 });
const unauthorized = () =>
  new UnauthorizedException({ code: "AUTH_REQUIRED", message: "Sign in again" });
let dummyHashPromise: Promise<string> | undefined;

function dummyPasswordHash(): Promise<string> {
  dummyHashPromise ??= hashPassword("sazeh-invalid-login-dummy-secret");
  return dummyHashPromise;
}

export async function requireLiveSession(
  db: QueryDatabase,
  claims: Claims,
  allowPasswordChange = false,
  lock?: "share" | "update",
): Promise<Principal> {
  const userQuery = db.select().from(users).where(eq(users.id, claims.sub)).limit(1);
  const [user] = await (lock ? userQuery.for(lock) : userQuery);
  const sessionQuery = db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, claims.sid), eq(sessions.userId, claims.sub)))
    .limit(1);
  const [session] = await (lock ? sessionQuery.for(lock) : sessionQuery);
  if (!user || !user.active) {
    throw new UnauthorizedException({
      code: "ACCOUNT_DISABLED",
      message: "This account is unavailable",
    });
  }
  if (
    !session ||
    session.revokedAt ||
    user.credentialVersion !== claims.cv ||
    session.credentialVersion !== claims.cv
  ) {
    throw new UnauthorizedException({ code: "SESSION_REVOKED", message: "Sign in again" });
  }
  if (session.expiresAt.getTime() <= Date.now()) throw unauthorized();
  if (user.mustChangePassword && !allowPasswordChange)
    throw new ForbiddenException({
      code: "PASSWORD_CHANGE_REQUIRED",
      message: "Change your temporary password first",
    });
  return {
    kind: user.mustChangePassword ? "password-change" : "workspace",
    userId: user.id,
    sessionId: session.id,
    credentialVersion: claims.cv,
    role: user.role,
  };
}

export function claimsFor(principal: Principal): Claims {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: principal.userId,
    sid: principal.sessionId,
    cv: principal.credentialVersion,
    iss: "sazeh-api",
    aud: "sazeh-browser",
    iat: now,
    exp: now + 900,
  };
}

@Injectable()
export class IdentityService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  private async throttle(username: string, address: string): Promise<void> {
    const now = new Date();
    await this.db.delete(loginBuckets).where(lte(loginBuckets.resetAt, now));
    for (const [key, limit] of [
      [`username:${username}`, 10],
      [`address:${address}`, 60],
    ] as const) {
      const [bucket] = await this.db
        .insert(loginBuckets)
        .values({ key: hash(key), attempts: 1, resetAt: new Date(now.getTime() + 15 * 60_000) })
        .onConflictDoUpdate({
          target: loginBuckets.key,
          set: {
            attempts: sql`case when ${loginBuckets.resetAt} <= now() then 1 else ${loginBuckets.attempts} + 1 end`,
            resetAt: sql`case when ${loginBuckets.resetAt} <= now() then now() + interval '15 minutes' else ${loginBuckets.resetAt} end`,
          },
        })
        .returning();
      if (!bucket || bucket.attempts > limit)
        throw new HttpException({ code: "LOGIN_THROTTLED", message: "Try again later" }, 429);
    }
  }

  async login(
    username: string,
    password: string,
    address: string,
  ): Promise<{ result: SessionResponse; refresh: string; expires: Date }> {
    await this.throttle(username, address);
    const result = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(users)
        .where(sql`lower(${users.username}) = ${username}`)
        .limit(1)
        .for("update");
      const verified = await argon2
        .verify(user?.passwordHash ?? (await dummyPasswordHash()), password)
        .catch(() => false);
      if (!user || !user.active || !verified) return undefined;
      const id = randomUUID();
      const refresh = opaqueToken();
      const expires = new Date(Date.now() + SESSION_SECONDS * 1000);
      await tx.insert(sessions).values({
        id,
        userId: user.id,
        credentialVersion: user.credentialVersion,
        expiresAt: expires,
      });
      await tx
        .insert(refreshTokens)
        .values({ tokenHash: hash(refresh), sessionId: id, generation: 0 });
      return {
        result: {
          ...signAccess({ sub: user.id, sid: id, cv: user.credentialVersion }),
          user: UserSchema.parse(userFieldsFrom(user)),
        },
        refresh,
        expires,
      };
    });
    if (!result)
      throw new UnauthorizedException({
        code: "INVALID_CREDENTIALS",
        message: "Username or password is incorrect",
      });
    await this.db
      .delete(loginBuckets)
      .where(
        sql`${loginBuckets.key} in (${hash(`username:${username}`)}, ${hash(`address:${address}`)})`,
      );
    return result;
  }

  async refresh(
    token: string | undefined,
  ): Promise<{ result: SessionResponse; refresh: string; expires: Date }> {
    if (!token || token.length > 128) throw unauthorized();
    const [lookup] = await this.db
      .select({ userId: sessions.userId, sessionId: sessions.id })
      .from(refreshTokens)
      .innerJoin(sessions, eq(sessions.id, refreshTokens.sessionId))
      .where(eq(refreshTokens.tokenHash, hash(token)))
      .limit(1);
    if (!lookup) throw unauthorized();
    const result = await this.db.transaction(async (tx) => {
      const [user] = await tx
        .select()
        .from(users)
        .where(eq(users.id, lookup.userId))
        .limit(1)
        .for("update");
      const [session] = await tx
        .select()
        .from(sessions)
        .where(eq(sessions.id, lookup.sessionId))
        .limit(1)
        .for("update");
      const [current] = await tx
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, hash(token)))
        .limit(1)
        .for("update");
      if (!user) return undefined;
      if (!user.active) {
        throw new UnauthorizedException({
          code: "ACCOUNT_DISABLED",
          message: "This account is unavailable",
        });
      }
      if (
        !session ||
        !current ||
        session.revokedAt ||
        session.credentialVersion !== user.credentialVersion
      ) {
        throw new UnauthorizedException({ code: "SESSION_REVOKED", message: "Sign in again" });
      }
      if (session.expiresAt.getTime() <= Date.now()) return { kind: "expired" as const };
      if (current.consumedAt) {
        await tx
          .update(sessions)
          .set({ revokedAt: new Date(), revocationReason: "refresh-replay" })
          .where(eq(sessions.id, session.id));
        return { kind: "replayed" as const };
      }
      const refresh = opaqueToken();
      await tx
        .update(refreshTokens)
        .set({ consumedAt: new Date() })
        .where(eq(refreshTokens.tokenHash, current.tokenHash));
      await tx.insert(refreshTokens).values({
        tokenHash: hash(refresh),
        sessionId: session.id,
        generation: current.generation + 1,
      });
      await tx.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, session.id));
      return {
        kind: "refreshed" as const,
        result: {
          ...signAccess({ sub: user.id, sid: session.id, cv: user.credentialVersion }),
          user: UserSchema.parse(userFieldsFrom(user)),
        },
        refresh,
        expires: session.expiresAt,
      };
    });
    if (!result || result.kind === "expired") throw unauthorized();
    if (result.kind === "replayed") {
      throw new UnauthorizedException({ code: "SESSION_REVOKED", message: "Sign in again" });
    }
    return result;
  }

  async logout(
    token: string | undefined,
    accessToken: string | undefined,
  ): Promise<{ clearRefreshCookie: boolean; sessionMismatch: boolean }> {
    const [cookieSession] =
      token && token.length <= 128
        ? await this.db
            .select({ sessionId: refreshTokens.sessionId })
            .from(refreshTokens)
            .where(eq(refreshTokens.tokenHash, hash(token)))
            .limit(1)
        : [];
    let claims: Claims | undefined;
    if (accessToken) {
      try {
        claims = verifyAccess(accessToken);
      } catch {
        return { clearRefreshCookie: !accessToken && Boolean(token), sessionMismatch: false };
      }
    }
    if (claims && cookieSession && claims.sid !== cookieSession.sessionId) {
      await this.db
        .update(sessions)
        .set({ revokedAt: new Date(), revocationReason: "logout" })
        .where(
          and(
            eq(sessions.id, claims.sid),
            eq(sessions.userId, claims.sub),
            isNull(sessions.revokedAt),
          ),
        );
      return { clearRefreshCookie: false, sessionMismatch: true };
    }
    const sessionId = claims?.sid ?? cookieSession?.sessionId;
    if (sessionId) {
      await this.db
        .update(sessions)
        .set({ revokedAt: new Date(), revocationReason: "logout" })
        .where(and(eq(sessions.id, sessionId), isNull(sessions.revokedAt)));
    }
    return { clearRefreshCookie: true, sessionMismatch: false };
  }

  async me(principal: Principal): Promise<User> {
    const [user] = await this.db
      .select(userFields)
      .from(users)
      .where(eq(users.id, principal.userId))
      .limit(1);
    return UserSchema.parse(user);
  }

  async authenticate(claims: Claims, allowPasswordChange: boolean): Promise<Principal> {
    return requireLiveSession(this.db, claims, allowPasswordChange);
  }

  async changePassword(
    principal: Principal,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const passwordHash = await hashPassword(newPassword);
    await this.db.transaction(async (tx) => {
      await requireLiveSession(tx, claimsFor(principal), true, "update");
      const [user] = await tx.select().from(users).where(eq(users.id, principal.userId)).limit(1);
      if (!user || !(await argon2.verify(user.passwordHash, currentPassword)))
        throw new UnauthorizedException({
          code: "INVALID_PASSWORD",
          message: "Current password is incorrect",
        });
      if (currentPassword === newPassword)
        throw new ConflictException({
          code: "PASSWORD_UNCHANGED",
          message: "Choose a different password",
        });
      await tx
        .update(users)
        .set({
          passwordHash,
          mustChangePassword: false,
          credentialVersion: user.credentialVersion + 1,
          updatedAt: new Date(),
        })
        .where(eq(users.id, user.id));
      await revokeAll(tx, user.id, "password-change");
      await audit(tx, principal, user.id, "password-change");
    });
  }

  async revokeSessions(principal: Principal): Promise<void> {
    await this.db.transaction(async (tx) => {
      await requireLiveSession(tx, claimsFor(principal), false, "update");
      await revokeAll(tx, principal.userId, "user-revocation");
      await audit(tx, principal, principal.userId, "revoke-sessions");
    });
  }

  async listAdmins(principal: Principal): Promise<User[]> {
    return this.db.transaction(async (tx) => {
      this.superuser(await requireLiveSession(tx, claimsFor(principal), false, "share"));
      return tx
        .select(userFields)
        .from(users)
        .where(eq(users.role, "ADMIN"))
        .orderBy(users.username);
    });
  }

  async createAdmin(
    principal: Principal,
    input: { username: string; displayName: string; temporaryPassword: string },
  ): Promise<User> {
    this.superuser(principal);
    const passwordHash = await hashPassword(input.temporaryPassword);
    return this.db.transaction(async (tx) => {
      this.superuser(await requireLiveSession(tx, claimsFor(principal), false, "share"));
      const [user] = await tx
        .insert(users)
        .values({
          username: input.username,
          displayName: input.displayName,
          passwordHash,
          role: "ADMIN",
          mustChangePassword: true,
        })
        .onConflictDoNothing()
        .returning(userFields);
      if (!user)
        throw new ConflictException({ code: "USERNAME_TAKEN", message: "Username is unavailable" });
      await audit(tx, principal, user.id, "create-admin");
      return user;
    });
  }

  async mutateAdmin(
    principal: Principal,
    id: string,
    change: { kind: "status"; active: boolean } | { kind: "reset"; temporaryPassword: string },
  ): Promise<User> {
    this.superuser(principal);
    const passwordHash =
      change.kind === "reset" ? await hashPassword(change.temporaryPassword) : undefined;
    return this.db.transaction(async (tx) => {
      this.superuser(await requireLiveSession(tx, claimsFor(principal), false, "share"));
      const [target] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, id), eq(users.role, "ADMIN")))
        .limit(1)
        .for("update");
      if (!target)
        throw new NotFoundException({ code: "ADMIN_NOT_FOUND", message: "Admin was not found" });
      if (change.kind === "reset" && passwordHash) {
        await tx
          .update(users)
          .set({
            passwordHash,
            mustChangePassword: true,
            credentialVersion: target.credentialVersion + 1,
            updatedAt: new Date(),
          })
          .where(eq(users.id, id));
        await revokeAll(tx, id, "admin-reset");
      } else if (change.kind === "status") {
        await tx
          .update(users)
          .set({ active: change.active, updatedAt: new Date() })
          .where(eq(users.id, id));
        if (!change.active) await revokeAll(tx, id, "account-disabled");
      }
      await audit(
        tx,
        principal,
        id,
        change.kind === "reset" ? "reset-password" : change.active ? "activate" : "deactivate",
      );
      const [updated] = await tx.select(userFields).from(users).where(eq(users.id, id)).limit(1);
      return UserSchema.parse(updated);
    });
  }

  private superuser(principal: Principal): void {
    if (principal.kind !== "workspace" || principal.role !== "SUPERUSER")
      throw new ForbiddenException({
        code: "SUPERUSER_REQUIRED",
        message: "Superuser access is required",
      });
  }
}

function userFieldsFrom(user: typeof users.$inferSelect): User {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    active: user.active,
    mustChangePassword: user.mustChangePassword,
  };
}
async function revokeAll(tx: Transaction, userId: string, reason: string): Promise<void> {
  await tx
    .update(sessions)
    .set({ revokedAt: new Date(), revocationReason: reason })
    .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
}
async function audit(
  tx: Transaction,
  principal: Principal,
  targetUserId: string,
  action: string,
): Promise<void> {
  await tx.insert(accountAudit).values({
    actorUserId: principal.userId,
    actorSessionId: principal.sessionId,
    targetUserId,
    action,
  });
}
