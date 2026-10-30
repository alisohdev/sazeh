import { authClient, ApiError } from "../identity/auth-client";
export async function api<T>(
  userId: string,
  path: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await authClient.requestForUser(
    "/api/v1/" + path,
    body === undefined ? {} : { method, body: JSON.stringify(body) },
    userId,
  );
  const data = await response.json().catch(() => undefined);
  if (!response.ok)
    throw new ApiError(
      data?.message ?? `درخواست انجام نشد (${response.status}).`,
      response.status,
      data?.code ?? "REQUEST_FAILED",
    );
  return data as T;
}
export async function pages<T>(userId: string, path: string): Promise<T[]> {
  const rows: T[] = [];
  let cursor: string | null = null;
  do {
    const page: { items: T[]; nextCursor: string | null } = await api(
      userId,
      path +
        (path.includes("?") ? "&" : "?") +
        "limit=200" +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : ""),
    );
    rows.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  return rows;
}
