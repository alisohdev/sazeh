import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type AddressInfo } from "node:net";
import { once } from "node:events";
import argon2 from "argon2";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { and, eq, inArray, isNull } from "drizzle-orm";
import * as schema from "../src/db/schema.js";
import {
  accountAudit,
  authenticatedReceipts,
  noteDrafts,
  refreshTokens,
  sessions,
  users,
} from "../src/db/schema.js";
import { ACCESS_SECONDS } from "../src/identity/tokens.js";

type LoginResult = {
  accessToken: string;
  expiresAt: number;
  user: { id: string; username: string; role: "SUPERUSER" | "ADMIN"; mustChangePassword: boolean };
  status?: number;
  errorCode?: string;
  errorMessage?: string;
};

async function main(): Promise<void> {
  if (process.env.APP_ENV !== "local") throw new Error("API verification requires APP_ENV=local");
  const databaseUrl = process.env.DATABASE_URL;
  const origin = process.env.AUTH_ALLOWED_ORIGIN;
  if (!databaseUrl || !origin) throw new Error("DATABASE_URL and AUTH_ALLOWED_ORIGIN are required");
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32)
    throw new Error("JWT_SECRET must contain at least 32 characters");

  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const fixturePassword = randomBytes(32).toString("base64url");
  const fixtureUsername = `m1averify-${randomUUID().slice(0, 8)}`;
  const fixtureId = randomUUID();
  const fixture: Array<{ id: string; username: string }> = [
    { id: fixtureId, username: fixtureUsername },
  ];
  const verificationDrafts: string[] = [];
  const client = postgres(databaseUrl, { max: 1 });
  await drizzle(client, { schema })
    .insert(users)
    .values({
      id: fixtureId,
      username: fixtureUsername,
      displayName: "M1a verification superuser",
      passwordHash: await argon2.hash(fixturePassword, {
        type: argon2.argon2id,
        memoryCost: 19_456,
        timeCost: 2,
        parallelism: 1,
      }),
      role: "SUPERUSER",
      active: true,
      mustChangePassword: false,
      credentialVersion: 1,
    });
  await client.end({ timeout: 5 });

  let server: ChildProcess | undefined;
  let childOutput = "";
  const start = async () => {
    server = spawn(process.execPath, ["--env-file=../../.env", "dist/main.js"], {
      cwd: process.cwd(),
      env: { ...process.env, APP_ENV: "local", API_PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server.stdout?.setEncoding("utf8");
    server.stdout?.on("data", (chunk: string) => {
      childOutput += chunk;
    });
    server.stderr?.setEncoding("utf8");
    server.stderr?.on("data", (chunk: string) => {
      childOutput += chunk;
    });
    await waitReady(base, server, () => childOutput);
  };

  let verificationSucceeded = false;
  let cleanupInvariantFailed: boolean;
  try {
    await start();
    assert.equal(
      (await fetch(`${base}/api/health/live`)).status,
      200,
      "health liveness stays public",
    );
    assert.equal(
      (await fetch(`${base}/api/health/ready`)).status,
      200,
      "health readiness stays public",
    );

    const root = makeClient(base, origin);
    await root.bootstrapCsrf();
    const legacy = await legacyDraftId(databaseUrl);

    const commandA = draftCommand(randomUUID(), randomUUID(), "M1a authenticated draft A");
    verificationDrafts.push(commandA.entityId);
    assert.equal(
      (await fetch(`${base}/api/v1/drafts/${legacy}`)).status,
      401,
      "direct draft reads reject unauthenticated callers",
    );
    const anonymousPost = await root.request(
      "/api/v1/drafts",
      { method: "POST", body: JSON.stringify(commandA) },
      { authenticated: false },
    );
    assert.equal(
      anonymousPost.status,
      401,
      "local mode does not provide an anonymous draft bypass",
    );
    assert.equal(
      (
        await root.request(
          "/api/v1/drafts",
          { method: "POST", body: JSON.stringify(commandA) },
          { origin: "https://attacker.example" },
        )
      ).status,
      403,
      "unsafe requests reject untrusted origins",
    );
    assert.equal(
      (
        await root.request(
          "/api/v1/drafts",
          { method: "POST", body: JSON.stringify(commandA) },
          { includeCsrfHeader: false },
        )
      ).status,
      403,
      "unsafe requests require a CSRF header bound to the cookie",
    );
    const noOrigin = await fetch(`${base}/api/v1/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `sazeh_csrf=${root.csrf}` },
      body: JSON.stringify({ username: fixtureUsername, password: fixturePassword }),
    });
    assert.equal(noOrigin.status, 403, "credential endpoints reject requests without Origin");

    const superuserLogin = await root.login(fixtureUsername, fixturePassword);
    assert(
      superuserLogin.user,
      `superuser login failed (${(superuserLogin as unknown as { status?: number; errorCode?: string }).status ?? "no status"} ${(superuserLogin as unknown as { errorCode?: string; errorMessage?: string }).errorCode ?? "no code"}: ${(superuserLogin as unknown as { errorMessage?: string }).errorMessage ?? "no message"}); API output: ${childOutput.slice(-4000)}`,
    );
    assert.equal(superuserLogin.user.role, "SUPERUSER");
    assert(
      superuserLogin.expiresAt - Date.now() <= 15 * 60_000,
      "access tokens expire within 15 minutes",
    );
    const noAuthPost = await root.request(
      "/api/v1/drafts",
      { method: "POST", body: JSON.stringify(commandA) },
      { authenticated: false },
    );
    assert.equal(noAuthPost.status, 401, "valid origin and CSRF do not replace authentication");
    assert.equal(
      (await root.request(`/api/v1/drafts/${legacy}`)).status,
      404,
      "legacy M0 data remains unowned and is not exposed after login",
    );
    assert.equal((await root.request("/api/v1/admins")).status, 200, "superuser can list admins");

    const createdAResponse = await root.request("/api/v1/admins", {
      method: "POST",
      body: JSON.stringify({
        username: `admin-${randomUUID().slice(0, 8)}`,
        displayName: "M1a admin A",
      }),
    });
    assert.equal(createdAResponse.status, 201, "superuser creates an ordinary admin account");
    const createdA = (await createdAResponse.json()) as {
      admin: { id: string; username: string; mustChangePassword: boolean };
      temporaryPassword: string;
    };
    fixture.push({ id: createdA.admin.id, username: createdA.admin.username });
    assert.equal(
      createdA.admin.mustChangePassword,
      true,
      "new admin must change the temporary password",
    );
    assert(createdA.temporaryPassword.length >= 14, "server returns a one-time temporary password");

    const adminA = makeClient(base, origin);
    await adminA.bootstrapCsrf();
    const temporaryLogin = await adminA.login(createdA.admin.username, createdA.temporaryPassword);
    assert.equal(temporaryLogin.user.mustChangePassword, true);
    const restrictedMe = await adminA.request("/api/v1/auth/me");
    assert.equal(
      restrictedMe.status,
      403,
      "temporary-password session cannot access application routes",
    );
    assert.equal(
      (await adminA.request("/api/v1/drafts", { method: "POST", body: JSON.stringify(commandA) }))
        .status,
      403,
      "temporary-password session cannot write drafts",
    );
    const newPasswordA = randomBytes(32).toString("base64url");
    const firstPasswordChange = await adminA.request("/api/v1/auth/password", {
      method: "POST",
      body: JSON.stringify({
        currentPassword: createdA.temporaryPassword,
        newPassword: newPasswordA,
      }),
    });
    assert.equal(
      firstPasswordChange.status,
      204,
      "first login permits only the required password change",
    );
    assert.equal(
      (await adminA.request("/api/v1/auth/me")).status,
      401,
      "password change revokes the temporary session",
    );
    assert.equal(
      (await adminA.login(createdA.admin.username, createdA.temporaryPassword)).status,
      401,
      "old temporary password is rejected after change",
    );
    const normalA = await adminA.login(createdA.admin.username, newPasswordA);
    assert.equal(normalA.user.mustChangePassword, false);
    assert.equal(
      (await adminA.request("/api/v1/admins")).status,
      403,
      "ordinary admins cannot call account-management endpoints",
    );

    const legacyRead = await adminA.request(`/api/v1/drafts/${legacy}`);
    assert.equal(legacyRead.status, 404, "legacy data has no inferred owner");
    const createdDraftA = await adminA.request("/api/v1/drafts", {
      method: "POST",
      body: JSON.stringify(commandA),
    });
    assert.equal(createdDraftA.status, 201, "authenticated draft create succeeds");
    const ackA = (await createdDraftA.json()) as {
      commandId: string;
      replayed: boolean;
      draft: { id: string; authorUserId: string; text: string; createdAt: string };
    };
    assert.equal(
      ackA.draft.authorUserId,
      normalA.user.id,
      "server derives the immutable author from the session",
    );
    assert.equal(ackA.draft.id, commandA.entityId);
    const spoofed = await adminA.request("/api/v1/drafts", {
      method: "POST",
      body: JSON.stringify({
        ...draftCommand(randomUUID(), randomUUID(), "spoofed"),
        authorUserId: fixtureId,
      }),
    });
    assert.equal(spoofed.status, 400, "client-supplied authors are rejected");
    const readA = await adminA.request(`/api/v1/drafts/${commandA.entityId}`);
    assert.equal(readA.status, 200, "owner can read a protected draft");
    const readBody = (await readA.json()) as { authorUserId: string; text: string };
    assert.equal(readBody.authorUserId, normalA.user.id);
    assert.equal(readBody.text, commandA.text);

    const retries = await Promise.all(
      Array.from({ length: 8 }, () =>
        adminA.request("/api/v1/drafts", { method: "POST", body: JSON.stringify(commandA) }),
      ),
    );
    assert(
      retries.every((response) => response.status === 201),
      "concurrent authenticated retries all succeed",
    );
    for (const response of retries)
      assert.equal(((await response.json()) as typeof ackA).replayed, true);
    assert.equal(
      (
        await adminA.request("/api/v1/drafts", {
          method: "POST",
          body: JSON.stringify({ ...commandA, text: `${commandA.text} changed` }),
        })
      ).status,
      409,
      "changed-body replay conflicts for its owner",
    );
    assert.equal(
      (
        await adminA.request("/api/v1/drafts", {
          method: "POST",
          body: JSON.stringify({ ...commandA, commandId: randomUUID() }),
        })
      ).status,
      409,
      "duplicate entity UUID remains globally prevented",
    );

    const createdBResponse = await root.request("/api/v1/admins", {
      method: "POST",
      body: JSON.stringify({
        username: `admin-${randomUUID().slice(0, 8)}`,
        displayName: "M1a admin B",
      }),
    });
    assert.equal(createdBResponse.status, 201);
    const createdB = (await createdBResponse.json()) as typeof createdA;
    fixture.push({ id: createdB.admin.id, username: createdB.admin.username });
    const adminB = makeClient(base, origin);
    await adminB.bootstrapCsrf();
    await adminB.login(createdB.admin.username, createdB.temporaryPassword);
    const newPasswordB = randomBytes(32).toString("base64url");
    assert.equal(
      (
        await adminB.request("/api/v1/auth/password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: createdB.temporaryPassword,
            newPassword: newPasswordB,
          }),
        })
      ).status,
      204,
    );
    const normalB = await adminB.login(createdB.admin.username, newPasswordB);
    const staleTab = makeClient(base, origin);
    await staleTab.bootstrapCsrf();
    const staleSession = await staleTab.login(createdA.admin.username, newPasswordA);
    const staleTabCookie = staleTab.refreshCookie;
    const activeAccountCookie = adminB.refreshCookie;
    assert(staleSession.accessToken && staleTabCookie && activeAccountCookie);
    staleTab.refreshCookie = activeAccountCookie;
    const staleTabLogout = await staleTab.request(
      "/api/v1/auth/logout",
      { method: "POST", body: "{}" },
      { authenticated: false, accessToken: staleSession.accessToken },
    );
    assert.equal(staleTabLogout.status, 204);
    assert.equal(
      staleTabLogout.headers.get("x-session-mismatch"),
      "true",
      "a stale tab detects that its bearer belongs to another session",
    );
    assert.equal(
      staleTab.refreshCookie,
      activeAccountCookie,
      "stale-tab logout leaves the active account refresh cookie untouched",
    );
    assert.equal(
      (await adminB.refresh()).status,
      200,
      "stale-tab logout does not revoke the other account's session",
    );
    staleTab.refreshCookie = staleTabCookie;
    const commandB = draftCommand(commandA.commandId, randomUUID(), "M1a authenticated draft B");
    verificationDrafts.push(commandB.entityId);
    const createdDraftB = await adminB.request("/api/v1/drafts", {
      method: "POST",
      body: JSON.stringify(commandB),
    });
    assert.equal(
      createdDraftB.status,
      201,
      "different user can use the same command UUID without replaying another user's receipt",
    );
    assert.equal(((await createdDraftB.json()) as { replayed: boolean }).replayed, false);
    assert.equal(
      (await adminA.request(`/api/v1/drafts/${commandB.entityId}`)).status,
      404,
      "user A cannot read user B's draft",
    );
    assert.equal(
      (await adminB.request(`/api/v1/drafts/${commandA.entityId}`)).status,
      404,
      "user B cannot read user A's draft",
    );

    const resetResponse = await root.request(`/api/v1/admins/${createdA.admin.id}/reset-password`, {
      method: "POST",
      body: "{}",
    });
    assert.equal(resetResponse.status, 201, "superuser can reset an admin password");
    const reset = (await resetResponse.json()) as {
      admin: { mustChangePassword: boolean };
      temporaryPassword: string;
    };
    assert.equal(reset.admin.mustChangePassword, true);
    assert(
      (await adminA.request("/api/v1/auth/me")).status === 401,
      "password reset immediately revokes an unexpired access token",
    );
    const afterReset = await adminA.login(createdA.admin.username, reset.temporaryPassword);
    assert.equal(
      afterReset.user.mustChangePassword,
      true,
      "reset temporary password requires a forced change",
    );
    const newPasswordAfterReset = randomBytes(32).toString("base64url");
    assert.equal(
      (
        await adminA.request("/api/v1/auth/password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: reset.temporaryPassword,
            newPassword: newPasswordAfterReset,
          }),
        })
      ).status,
      204,
    );
    const activeA = await adminA.login(createdA.admin.username, newPasswordAfterReset);

    const disable = await root.request(`/api/v1/admins/${createdA.admin.id}/status`, {
      method: "POST",
      body: JSON.stringify({ active: false }),
    });
    assert.equal(disable.status, 201, "superuser can disable an admin account");
    assert(
      activeA.expiresAt > Date.now(),
      "the disabled-account test uses a still-unexpired access token",
    );
    const disabledAccess = await adminA.request("/api/v1/auth/me");
    assert.equal(
      disabledAccess.status,
      401,
      "disabled account fails a protected request before JWT expiry",
    );
    assert.equal(((await disabledAccess.json()) as { code: string }).code, "ACCOUNT_DISABLED");
    adminA.accessToken = activeA.accessToken;
    const disabledRefresh = await adminA.refresh();
    assert.equal(disabledRefresh.status, 401, "disabled account cannot refresh its session");
    assert.equal(((await disabledRefresh.json()) as { code: string }).code, "ACCOUNT_DISABLED");
    assert.equal(
      (
        await root.request(`/api/v1/admins/${createdA.admin.id}/status`, {
          method: "POST",
          body: JSON.stringify({ active: true }),
        })
      ).status,
      201,
      "superuser can reactivate an admin",
    );
    await adminA.login(createdA.admin.username, newPasswordAfterReset);

    const logoutAccess = adminA.accessToken;
    assert(logoutAccess);
    assert.equal(
      (await adminA.logout()).status,
      204,
      "logout revokes the refresh family and clears the cookie",
    );
    assert.equal(
      (await adminA.request("/api/v1/auth/me")).status,
      401,
      "logout immediately invalidates access JWTs",
    );

    const bearerLogoutLogin = await adminA.login(createdA.admin.username, newPasswordAfterReset);
    assert(bearerLogoutLogin.expiresAt > Date.now());
    adminA.refreshCookie = undefined;
    assert.equal(
      (
        await adminA.request("/api/v1/auth/logout", {
          method: "POST",
          body: "{}",
        })
      ).status,
      204,
      "logout can revoke a live bearer session when the refresh cookie is absent",
    );
    assert.equal(
      (await adminA.request("/api/v1/auth/me")).status,
      401,
      "bearer-only logout revokes its unexpired access token",
    );

    const expiredLogoutLogin = await adminA.login(createdA.admin.username, newPasswordAfterReset);
    assert(expiredLogoutLogin.accessToken && adminA.refreshCookie);
    const expiredLogout = await adminA.request(
      "/api/v1/auth/logout",
      { method: "POST", body: "{}" },
      {
        authenticated: false,
        accessToken: makeExpiredAccessToken(expiredLogoutLogin.accessToken),
      },
    );
    assert.equal(expiredLogout.status, 204, "logout accepts a signed expired bearer token");
    assert.equal(
      (await adminA.refresh()).status,
      401,
      "expired bearer logout revokes the session and clears its valid refresh cookie",
    );

    const revokeLogin = await adminA.login(createdA.admin.username, newPasswordAfterReset);
    const revokeResponse = await adminA.request("/api/v1/auth/sessions/revoke", {
      method: "POST",
      body: "{}",
    });
    assert.equal(revokeResponse.status, 204, "user can revoke their sessions");
    assert.equal(
      (await adminA.request("/api/v1/auth/me")).status,
      401,
      "session revocation invalidates the current access token",
    );
    assert(revokeLogin.expiresAt > Date.now());

    const replayLogin = await adminA.login(createdA.admin.username, newPasswordAfterReset);
    const oldRefresh = adminA.refreshCookie;
    assert(oldRefresh);
    const rotated = await adminA.refresh();
    assert.equal(rotated.status, 200, "refresh rotates a valid token");
    const newRefresh = adminA.refreshCookie;
    assert(
      newRefresh && newRefresh !== oldRefresh,
      "rotated token differs from the consumed token",
    );
    adminA.refreshCookie = oldRefresh;
    const replay = await adminA.refresh();
    assert.equal(replay.status, 401, "replayed refresh token is rejected");
    assert.equal(
      ((await replay.json()) as { code: string }).code,
      "SESSION_REVOKED",
      "refresh replay has an explicit revocation result",
    );
    adminA.refreshCookie = newRefresh;
    assert.equal((await adminA.refresh()).status, 401, "replay revokes the full refresh family");
    adminA.accessToken = replayLogin.accessToken;
    assert.equal(
      (await adminA.request("/api/v1/auth/me")).status,
      401,
      "refresh replay revokes live access tokens for that session",
    );

    const selfPasswordLogin = await adminA.login(createdA.admin.username, newPasswordAfterReset);
    assert(selfPasswordLogin.expiresAt > Date.now());
    const selfPassword = randomBytes(32).toString("base64url");
    assert.equal(
      (
        await adminA.request("/api/v1/auth/password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword: newPasswordAfterReset,
            newPassword: selfPassword,
          }),
        })
      ).status,
      204,
      "an ordinary admin can change their own active password",
    );
    assert.equal(
      (await adminA.request("/api/v1/auth/me")).status,
      401,
      "own-password change revokes the current access token",
    );
    const oldPasswordLogin = await adminA.login(createdA.admin.username, newPasswordAfterReset);
    assert.equal(oldPasswordLogin.status, 401, "the old password stops working after change");
    const newPasswordLogin = await adminA.login(createdA.admin.username, selfPassword);
    assert.equal(newPasswordLogin.user.mustChangePassword, false);

    const throttleClient = makeClient(base, origin);
    await throttleClient.bootstrapCsrf();
    const throttledUsername = `bad-${randomUUID().slice(0, 10)}`;
    let lastStatus = 0;
    for (let attempt = 0; attempt < 11; attempt += 1) {
      lastStatus = (
        await throttleClient.request(
          "/api/v1/auth/login",
          {
            method: "POST",
            body: JSON.stringify({ username: throttledUsername, password: "incorrect" }),
          },
          { authenticated: false },
        )
      ).status;
    }
    assert.equal(lastStatus, 429, "repeated login failures are rate limited");

    const verifyClient = postgres(databaseUrl, { max: 1 });
    try {
      const db = drizzle(verifyClient, { schema });
      const rowsA = await db
        .select()
        .from(authenticatedReceipts)
        .where(
          and(
            eq(authenticatedReceipts.userId, normalA.user.id),
            eq(authenticatedReceipts.commandId, commandA.commandId),
          ),
        );
      const rowsB = await db
        .select()
        .from(authenticatedReceipts)
        .where(
          and(
            eq(authenticatedReceipts.userId, normalB.user.id),
            eq(authenticatedReceipts.commandId, commandA.commandId),
          ),
        );
      assert.equal(rowsA.length, 1);
      assert.equal(rowsB.length, 1);
      const drafts = await db
        .select()
        .from(noteDrafts)
        .where(inArray(noteDrafts.id, verificationDrafts));
      assert(drafts.every((draft) => draft.authorUserId !== null));
    } finally {
      await verifyClient.end({ timeout: 5 });
    }

    process.stdout.write(
      "API M1a verification passed: direct auth, first-login gate, account lifecycle, refresh replay, live disable, author-scoped drafts/receipts, origin/CSRF and throttling.\n",
    );
    verificationSucceeded = true;
  } finally {
    if (server) await stop(server);
    const cleanup = postgres(databaseUrl, { max: 1 });
    try {
      const db = drizzle(cleanup, { schema });
      const ids = fixture.map((entry) => entry.id);
      const removed = await db.transaction(async (tx) => {
        await tx.delete(accountAudit).where(inArray(accountAudit.targetUserId, ids));
        await tx.delete(accountAudit).where(inArray(accountAudit.actorUserId, ids));
        const ownedDrafts = await tx
          .select({ id: noteDrafts.id })
          .from(noteDrafts)
          .where(inArray(noteDrafts.authorUserId, ids));
        const draftIds = [...ownedDrafts.map((draft) => draft.id), ...verificationDrafts];
        if (draftIds.length > 0)
          await tx.delete(noteDrafts).where(inArray(noteDrafts.id, draftIds));
        await tx.delete(authenticatedReceipts).where(inArray(authenticatedReceipts.userId, ids));
        const fixtureSessions = await tx
          .select({ id: sessions.id })
          .from(sessions)
          .where(inArray(sessions.userId, ids));
        const sessionIds = fixtureSessions.map((session) => session.id);
        if (sessionIds.length > 0) {
          await tx.delete(refreshTokens).where(inArray(refreshTokens.sessionId, sessionIds));
          await tx.delete(sessions).where(inArray(sessions.id, sessionIds));
        }
        const deletedUsers = await tx
          .delete(users)
          .where(inArray(users.id, ids))
          .returning({ id: users.id });
        return { users: deletedUsers.length, ids: ids.length };
      });
      cleanupInvariantFailed = verificationSucceeded && removed.users !== removed.ids;
      if (verificationSucceeded && !cleanupInvariantFailed)
        process.stdout.write(
          "API verification accounts, sessions, receipts and drafts were cleaned up.\n",
        );
    } finally {
      await cleanup.end({ timeout: 5 });
    }
  }
  if (cleanupInvariantFailed)
    throw new Error("API verification passed but its fixture records were not fully removed");
}

function makeClient(base: string, origin: string) {
  let csrf = "";
  let refreshCookie: string | undefined;
  let accessToken: string | undefined;
  return {
    get csrf() {
      return csrf;
    },
    set accessToken(value: string | undefined) {
      accessToken = value;
    },
    get accessToken() {
      return accessToken;
    },
    get refreshCookie() {
      return refreshCookie;
    },
    set refreshCookie(value: string | undefined) {
      refreshCookie = value;
    },
    async bootstrapCsrf() {
      const response = await fetch(`${base}/api/v1/auth/csrf`, { headers: { origin } });
      assert.equal(response.status, 200);
      csrf = ((await response.json()) as { csrfToken: string }).csrfToken;
    },
    async request(
      path: string,
      init: RequestInit = {},
      options: {
        authenticated?: boolean;
        origin?: string | null;
        includeCsrfHeader?: boolean;
        accessToken?: string;
      } = {},
    ) {
      const headers = new Headers(init.headers);
      if (init.body !== undefined && !headers.has("content-type"))
        headers.set("content-type", "application/json");
      if (options.origin !== null) headers.set("origin", options.origin ?? origin);
      const cookieParts = [
        csrf ? `sazeh_csrf=${csrf}` : "",
        refreshCookie ? `sazeh_refresh=${refreshCookie}` : "",
      ].filter(Boolean);
      if (cookieParts.length > 0) headers.set("cookie", cookieParts.join("; "));
      if (
        options.includeCsrfHeader !== false &&
        csrf &&
        ["POST", "PUT", "PATCH", "DELETE"].includes((init.method ?? "GET").toUpperCase())
      )
        headers.set("x-csrf-token", csrf);
      const bearerToken =
        options.accessToken ?? (options.authenticated !== false ? accessToken : undefined);
      if (bearerToken) headers.set("authorization", `Bearer ${bearerToken}`);
      const response = await fetch(`${base}${path}`, { ...init, headers });
      for (const setCookie of getSetCookies(response)) {
        const match = /^sazeh_refresh=([^;]*)/.exec(setCookie);
        if (match) refreshCookie = match[1] || undefined;
      }
      return response;
    },
    async login(username: string, password: string): Promise<LoginResult> {
      const response = await this.request(
        "/api/v1/auth/login",
        { method: "POST", body: JSON.stringify({ username, password }) },
        { authenticated: false },
      );
      if (!response.ok) {
        const problem = (await response.json().catch(() => undefined)) as
          { code?: string; message?: string } | undefined;
        return {
          status: response.status,
          errorCode: problem?.code,
          errorMessage: problem?.message,
        } as unknown as LoginResult;
      }
      const result = (await response.json()) as LoginResult;
      accessToken = result.accessToken;
      return result;
    },
    async refresh(): Promise<Response> {
      const response = await this.request(
        "/api/v1/auth/refresh",
        { method: "POST", body: "{}" },
        { authenticated: false },
      );
      if (response.ok)
        accessToken = await response.json().then((body) => (body as LoginResult).accessToken);
      return response;
    },
    async logout(): Promise<Response> {
      const response = await this.request(
        "/api/v1/auth/logout",
        { method: "POST", body: "{}" },
        { authenticated: false },
      );
      accessToken = undefined;
      return response;
    },
  };
}

function getSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return (
    headers.getSetCookie?.() ??
    (response.headers.get("set-cookie") ? [response.headers.get("set-cookie")!] : [])
  );
}

function draftCommand(commandId: string, entityId: string, text: string) {
  return {
    protocolVersion: 1,
    commandId,
    entityId,
    expectedVersion: 0,
    kind: "CREATE_NOTE_DRAFT",
    text,
  };
}

function makeExpiredAccessToken(accessToken: string): string {
  const [header, body, signature, extra] = accessToken.split(".");
  assert(header && body && signature && !extra, "fixture access token is a JWT");
  const claims = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>;
  const issuedAt = Math.floor(Date.now() / 1000) - ACCESS_SECONDS - 1;
  claims.iat = issuedAt;
  claims.exp = issuedAt + ACCESS_SECONDS;
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const content = `${header}.${payload}`;
  const mac = createHmac("sha256", process.env.JWT_SECRET!).update(content).digest("base64url");
  return `${content}.${mac}`;
}

async function legacyDraftId(databaseUrl: string): Promise<string> {
  const client = postgres(databaseUrl, { max: 1 });
  try {
    const [draft] = await drizzle(client, { schema })
      .select({ id: noteDrafts.id })
      .from(noteDrafts)
      .where(isNull(noteDrafts.authorUserId))
      .limit(1);
    if (!draft) throw new Error("M1a API proof expects the explicit unowned M0 synthetic seed");
    return draft.id;
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = (server.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

async function waitReady(base: string, server: ChildProcess, output: () => string): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`API stopped during startup: ${output()}`);
    try {
      if ((await fetch(`${base}/api/health/ready`)).ok) return;
    } catch (error) {
      if (!(error instanceof TypeError)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`API did not become ready: ${output()}`);
}

async function stop(server: ChildProcess): Promise<void> {
  if (server.exitCode !== null) return;
  const exited = once(server, "exit");
  server.kill("SIGTERM");
  if (
    (await Promise.race([
      exited.then(() => "exited"),
      new Promise<string>((resolve) => setTimeout(() => resolve("timeout"), 5_000)),
    ])) === "timeout"
  ) {
    server.kill("SIGKILL");
    await exited;
  }
}

void main();
