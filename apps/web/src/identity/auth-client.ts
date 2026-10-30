import { SessionResponseSchema, type SessionResponse, type User } from "@sazeh/contracts";
import { errorMessage } from "../lib/error-message";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(errorMessage({ code, message }, status));
  }
}
let accessToken: string | undefined;
let accessExpiresAt = 0;
let sessionUser: User | undefined;
let csrfValue: string | undefined;
let refreshInFlight: Promise<SessionResponse> | undefined;
let generation = 0;
const listeners = new Set<() => void>();
const channel =
  typeof BroadcastChannel === "undefined" ? undefined : new BroadcastChannel("sazeh-session");
channel?.addEventListener("message", () => {
  sessionStorage.setItem("sazeh-signed-out", "true");
  clearSession();
});
function clearSession() {
  generation++;
  accessToken = undefined;
  accessExpiresAt = 0;
  sessionUser = undefined;
  for (const listener of listeners) listener();
}
function accept(result: SessionResponse, expectedGeneration: number) {
  if (generation !== expectedGeneration)
    throw new ApiError("نشست تغییر کرده است؛ دوباره وارد شوید.", 401, "SESSION_CHANGED");
  accessToken = result.accessToken;
  accessExpiresAt = result.expiresAt;
  sessionUser = result.user;
  sessionStorage.removeItem("sazeh-signed-out");
  return result;
}
export const authClient = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  async csrf() {
    if (csrfValue) return;
    const response = await localizedFetch("/api/v1/auth/csrf", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) throw await apiError(response);
    const body = await response.json();
    if (typeof body.csrfToken !== "string") throw new Error("توکن درخواست دریافت نشد.");
    csrfValue = body.csrfToken;
  },
  async login(username: string, password: string) {
    const current = ++generation;
    const response = await send("/api/v1/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    const grant = accept(SessionResponseSchema.parse(await jsonOrError(response)), current);
    channel?.postMessage("account-changed");
    return grant;
  },
  async refresh(): Promise<SessionResponse> {
    if (refreshInFlight) return refreshInFlight;
    const current = generation;
    const refresh = async () => {
      const response = await send("/api/v1/auth/refresh", { method: "POST", body: "{}" });
      return accept(SessionResponseSchema.parse(await jsonOrError(response)), current);
    };
    refreshInFlight = (
      navigator.locks ? navigator.locks.request("sazeh-session-refresh", refresh) : refresh()
    )
      .catch((error) => {
        if (error instanceof ApiError && error.status === 401 && current === generation)
          clearSession();
        throw error;
      })
      .finally(() => {
        refreshInFlight = undefined;
      });
    return refreshInFlight;
  },
  async restore() {
    if (sessionStorage.getItem("sazeh-signed-out"))
      throw new ApiError("دوباره وارد شوید.", 401, "AUTH_REQUIRED");
    return this.refresh();
  },
  async token(userId?: string) {
    if (!accessToken || accessExpiresAt <= Date.now() + 30_000) await this.refresh();
    if (!accessToken || (userId && sessionUser?.id !== userId))
      throw new ApiError("حساب تغییر کرده است؛ دوباره وارد شوید.", 401, "ACCOUNT_CHANGED");
    return accessToken;
  },
  async request(path: string, init: RequestInit = {}, authenticated = true): Promise<Response> {
    return authenticated ? this.requestForUser(path, init, sessionUser?.id) : send(path, init);
  },
  async requestForUser(path: string, init: RequestInit, userId?: string): Promise<Response> {
    if (!navigator.onLine)
      throw new Error("برای ادامه به اینترنت متصل شوید. هیچ تغییری ذخیره نشده است.");
    const expected = userId ?? sessionUser?.id;
    const current = generation;
    const response = await send(path, init, await this.token(expected));
    if (current !== generation) throw new ApiError("نشست تغییر کرده است.", 401, "SESSION_CHANGED");
    if (response.status !== 401) return response;
    const problem = await response
      .clone()
      .json()
      .catch(() => ({}));
    if (["ACCOUNT_DISABLED", "SESSION_REVOKED"].includes(problem.code)) {
      clearSession();
      throw await apiError(response);
    }
    await this.refresh();
    const retry = await send(path, init, await this.token(expected));
    if (current !== generation) throw new ApiError("نشست تغییر کرده است.", 401, "SESSION_CHANGED");
    if (retry.status === 401) {
      clearSession();
      throw await apiError(retry);
    }
    return retry;
  },
  async currentUser() {
    return sessionUser;
  },
  async changePassword(currentPassword: string, newPassword: string) {
    await jsonOrError(
      await this.request("/api/v1/auth/password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    );
    sessionStorage.setItem("sazeh-signed-out", "true");
    clearSession();
    channel?.postMessage("password-changed");
  },
  async logout() {
    await jsonOrError(
      await send("/api/v1/auth/logout", { method: "POST", body: "{}" }, accessToken),
    );
    sessionStorage.setItem("sazeh-signed-out", "true");
    clearSession();
    channel?.postMessage("logout");
  },
  clear: clearSession,
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
  let response = await localizedFetch(path, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (response.status === 403) {
    const problem = (await response
      .clone()
      .json()
      .catch(() => undefined)) as { code?: string } | undefined;
    if (problem?.code === "CSRF_REJECTED") {
      csrfValue = undefined;
      await authClient.csrf();
      if (csrfValue) headers.set("x-csrf-token", csrfValue);
      response = await localizedFetch(path, {
        ...init,
        headers,
        credentials: "include",
        cache: "no-store",
      });
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

async function localizedFetch(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, init);
  } catch {
    throw new ApiError("", 0, "NETWORK_ERROR");
  }
}
