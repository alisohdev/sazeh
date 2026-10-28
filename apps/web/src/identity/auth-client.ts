import { SessionResponseSchema, type SessionResponse, type User } from "@sazeh/contracts";
import { workspaceControl } from "./workspace-control.js";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
  }
}

let accessToken: string | undefined;
let accessExpiresAt = 0;
let sessionUser: User | undefined;
let csrfValue: string | undefined;
let refreshInFlight: Promise<SessionResponse> | undefined;

export const authClient = {
  async csrf(): Promise<void> {
    if (csrfValue) return;
    const response = await fetch("/api/v1/auth/csrf", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw await apiError(response);
    const body = (await response.json()) as { csrfToken?: unknown };
    if (typeof body.csrfToken !== "string")
      throw new Error("The server did not return a request token.");
    csrfValue = body.csrfToken;
  },

  async login(username: string, password: string): Promise<SessionResponse> {
    return workspaceControl.withLifecycleLock(async (signal) => {
      const state = await workspaceControl.state();
      if (state.phase !== "signed-out") {
        throw new ApiError(
          "Leave the current browser workspace before signing in.",
          409,
          "ACCOUNT_SWITCH_REQUIRED",
        );
      }
      await this.csrf();
      const response = await send("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
        signal,
      });
      const result = SessionResponseSchema.parse(await jsonOrError(response));
      try {
        await acceptSession(result);
      } catch (error) {
        await this.logoutLocked(signal, result.accessToken);
        throw error;
      }
      return result;
    });
  },

  async refresh(): Promise<SessionResponse> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = workspaceControl
      .withLifecycleLock(async (signal) => {
        const state = await workspaceControl.state();
        if (state.phase === "departing" || state.phase === "logout-pending") {
          throw new ApiError(
            "Finish signing out before refreshing the session.",
            401,
            "AUTH_REQUIRED",
          );
        }
        await this.csrf();
        const response = await send("/api/v1/auth/refresh", { method: "POST", body: "{}", signal });
        const result = SessionResponseSchema.parse(await jsonOrError(response));
        try {
          await acceptSession(result);
        } catch (error) {
          await this.logoutLocked(signal, result.accessToken);
          throw error;
        }
        return result;
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) clearMemory();
        throw error;
      })
      .finally(() => {
        refreshInFlight = undefined;
      });
    return refreshInFlight;
  },

  async restore(): Promise<SessionResponse> {
    const state = await workspaceControl.state();
    if (state.phase === "signed-out" && state.explicitLoginRequired) {
      clearMemory();
      throw new ApiError("Enter your credentials to continue.", 401, "AUTH_REQUIRED");
    }
    try {
      return await this.refresh();
    } catch (error) {
      clearMemory();
      throw error;
    }
  },

  async tokenForSync(expectedUserId?: string): Promise<string> {
    if (!accessToken || accessExpiresAt <= Date.now() + 30_000) {
      const grant = await this.refresh();
      if (expectedUserId && grant.user.id !== expectedUserId) {
        throw new ApiError(
          "The browser account changed. This draft was not sent.",
          401,
          "ACCOUNT_SWITCHED",
        );
      }
    }
    if (!accessToken)
      throw new ApiError("Sign in again to synchronize drafts.", 401, "AUTH_REQUIRED");
    if (expectedUserId && sessionUser?.id !== expectedUserId) {
      throw new ApiError(
        "The browser account changed. This draft was not sent.",
        401,
        "ACCOUNT_SWITCHED",
      );
    }
    return accessToken;
  },

  async request(path: string, init: RequestInit = {}, authenticated = true): Promise<Response> {
    const expectedUserId = sessionUser?.id;
    let token = authenticated ? await this.tokenForSync(expectedUserId) : undefined;
    let response = await send(path, init, token);
    if (authenticated && response.status === 401) {
      const problem = (await response
        .clone()
        .json()
        .catch(() => undefined)) as { code?: string } | undefined;
      if (problem?.code === "ACCOUNT_DISABLED" || problem?.code === "SESSION_REVOKED") {
        clearMemory();
        throw new ApiError("Your session is no longer active.", 401, problem.code);
      }
      const grant = await this.refresh();
      if (expectedUserId && grant.user.id !== expectedUserId) {
        throw new ApiError("The browser account changed. Sign in again.", 401, "ACCOUNT_SWITCHED");
      }
      token = grant.accessToken;
      response = await send(path, init, token);
    }
    return response;
  },

  async requestForUser(path: string, init: RequestInit, userId: string): Promise<Response> {
    let token = await this.tokenForSync(userId);
    let response = await send(path, init, token);
    if (response.status === 401) {
      const problem = (await response
        .clone()
        .json()
        .catch(() => undefined)) as { code?: string } | undefined;
      if (problem?.code === "ACCOUNT_DISABLED" || problem?.code === "SESSION_REVOKED") {
        clearMemory();
        throw new ApiError("Your session is no longer active.", 401, problem.code);
      }
      const grant = await this.refresh();
      if (grant.user.id !== userId)
        throw new ApiError(
          "The browser account changed. This draft was not sent.",
          401,
          "ACCOUNT_SWITCHED",
        );
      token = grant.accessToken;
      response = await send(path, init, token);
    }
    return response;
  },

  async currentUser(): Promise<User | undefined> {
    if (!accessToken || accessExpiresAt <= Date.now()) return undefined;
    return sessionUser;
  },

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await workspaceControl.withLifecycleLock(async (signal) => {
      if (!accessToken || accessExpiresAt <= Date.now()) {
        throw new ApiError("Sign in again before changing the password.", 401, "AUTH_REQUIRED");
      }
      const currentUserId = sessionUser?.id;
      if (!currentUserId) throw new ApiError("Sign in again.", 401, "AUTH_REQUIRED");
      const response = await send(
        "/api/v1/auth/password",
        {
          method: "POST",
          body: JSON.stringify({ currentPassword, newPassword }),
          signal,
        },
        accessToken,
      );
      await jsonOrError(response);
      await workspaceControl.completePasswordChange(currentUserId);
      clearMemory();
    });
  },

  async logout(): Promise<void> {
    await workspaceControl.withLifecycleLock(async (signal) => {
      await this.logoutLocked(signal);
    });
  },

  async logoutLocked(signal: AbortSignal, token = accessToken): Promise<void> {
    const usableToken = token === accessToken ? accessExpiresAt > Date.now() : Boolean(token);
    await this.csrf();
    const response = await send(
      "/api/v1/auth/logout",
      { method: "POST", body: "{}", signal },
      usableToken ? token : undefined,
    );
    if (!response.ok && response.status !== 204) throw await apiError(response);
    if (response.headers.get("x-session-mismatch") === "true") {
      await workspaceControl.requireExplicitLogin();
    }
    clearMemory();
  },

  clear(): void {
    clearMemory();
  },
};

async function send(path: string, init: RequestInit, token?: string): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined && !headers.has("content-type"))
    headers.set("content-type", "application/json");
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (["POST", "PUT", "PATCH", "DELETE"].includes((init.method ?? "GET").toUpperCase())) {
    await authClient.csrf();
    if (csrfValue) headers.set("x-csrf-token", csrfValue);
  }
  let response = await fetch(path, { ...init, headers, credentials: "include", cache: "no-store" });
  if (response.status === 403) {
    const problem = (await response
      .clone()
      .json()
      .catch(() => undefined)) as { code?: string } | undefined;
    if (problem?.code === "CSRF_REJECTED") {
      csrfValue = undefined;
      await authClient.csrf();
      if (csrfValue) headers.set("x-csrf-token", csrfValue);
      response = await fetch(path, { ...init, headers, credentials: "include", cache: "no-store" });
    }
  }
  return response;
}

async function jsonOrError(response: Response): Promise<unknown> {
  if (!response.ok && response.status !== 204) throw await apiError(response);
  if (response.status === 204) return undefined;
  return response.json();
}

async function apiError(response: Response): Promise<ApiError> {
  const problem = (await response.json().catch(() => undefined)) as
    { code?: string; message?: string } | undefined;
  return new ApiError(
    problem?.message ?? `Request failed (${response.status})`,
    response.status,
    problem?.code ?? "REQUEST_FAILED",
  );
}

function remember(result: SessionResponse): void {
  accessToken = result.accessToken;
  accessExpiresAt = result.expiresAt;
  sessionUser = result.user;
}

async function acceptSession(result: SessionResponse): Promise<void> {
  const state = await workspaceControl.state();
  if (state.phase === "departing" || state.phase === "logout-pending") {
    throw new ApiError("The current workspace is signing out.", 409, "ACCOUNT_SWITCH_REQUIRED");
  }
  if (state.phase === "active" && state.user?.id !== result.user.id) {
    throw new ApiError("The browser account changed. Sign in again.", 401, "ACCOUNT_SWITCHED");
  }
  await workspaceControl.activate(result.user);
  remember(result);
}

function clearMemory(): void {
  accessToken = undefined;
  accessExpiresAt = 0;
  sessionUser = undefined;
}
