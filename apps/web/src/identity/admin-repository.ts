import { UserSchema, type User } from "@sazeh/contracts";
import { authClient } from "./auth-client";

export async function listAdmins(): Promise<User[]> {
  return UserSchema.array().parse(record(await request("/api/v1/admins"))?.admins);
}

export async function createAdmin(input: { username: string; displayName: string }) {
  return createdAdmin(
    await request("/api/v1/admins", { method: "POST", body: JSON.stringify(input) }),
  );
}

export async function setAdminStatus(id: string, active: boolean): Promise<User> {
  const body = record(
    await request(`/api/v1/admins/${id}/status`, {
      method: "POST",
      body: JSON.stringify({ active }),
    }),
  );
  return UserSchema.parse(body?.admin);
}

export async function resetAdminPassword(id: string): Promise<string> {
  return createdAdmin(
    await request(`/api/v1/admins/${id}/reset-password`, {
      method: "POST",
      body: "{}",
    }),
  ).temporaryPassword;
}

function createdAdmin(value: unknown): { admin: User; temporaryPassword: string } {
  const body = record(value);
  const password = body?.temporaryPassword;
  if (typeof password !== "string" || password.length < 14)
    throw new Error("پاسخ ساخت حساب معتبر نیست.");
  return { admin: UserSchema.parse(body?.admin), temporaryPassword: password };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  const response = await authClient.request(path, init);
  const body: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "message" in body && typeof body.message === "string"
        ? body.message
        : "درخواست مدیریت حساب انجام نشد.";
    throw new Error(message);
  }
  return body;
}
