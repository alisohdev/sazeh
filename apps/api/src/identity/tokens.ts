import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { UnauthorizedException } from "@nestjs/common";
import { z } from "zod";

const ClaimsSchema = z
  .object({
    sub: z.uuid(),
    sid: z.uuid(),
    cv: z.number().int().positive(),
    iss: z.literal("sazeh-api"),
    aud: z.literal("sazeh-browser"),
    iat: z.number().int(),
    exp: z.number().int(),
  })
  .strict();
export type Claims = z.infer<typeof ClaimsSchema>;
export const ACCESS_SECONDS = 15 * 60;
export const SESSION_SECONDS = 7 * 24 * 60 * 60;

export function signingKey(): string {
  const key = process.env.JWT_SECRET;
  if (!key || key.length < 32) throw new Error("JWT_SECRET must contain at least 32 characters");
  return key;
}

function signature(value: string): string {
  return createHmac("sha256", signingKey()).update(value).digest("base64url");
}

export function opaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function signAccess(input: Pick<Claims, "sub" | "sid" | "cv">): {
  accessToken: string;
  expiresAt: number;
} {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ACCESS_SECONDS;
  const body = Buffer.from(
    JSON.stringify({ ...input, iss: "sazeh-api", aud: "sazeh-browser", iat: now, exp: expiresAt }),
  ).toString("base64url");
  const value = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url")}.${body}`;
  return { accessToken: `${value}.${signature(value)}`, expiresAt: expiresAt * 1000 };
}

export function equalSecret(a: string, b: string): boolean {
  const first = Buffer.from(a);
  const second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
}

export function verifyAccess(token: string): Claims {
  try {
    const [header, body, mac, extra] = token.split(".");
    if (!header || !body || !mac || extra || token.length > 2048) throw new Error();
    const parsed: unknown = JSON.parse(Buffer.from(header, "base64url").toString());
    z.object({ alg: z.literal("HS256"), typ: z.literal("JWT") })
      .strict()
      .parse(parsed);
    if (!equalSecret(mac, signature(`${header}.${body}`))) throw new Error();
    const claims = ClaimsSchema.parse(JSON.parse(Buffer.from(body, "base64url").toString()));
    const now = Math.floor(Date.now() / 1000);
    if (claims.exp <= now || claims.iat > now + 30 || claims.exp - claims.iat !== ACCESS_SECONDS)
      throw new Error();
    return claims;
  } catch {
    throw new UnauthorizedException({ code: "AUTH_REQUIRED", message: "Sign in again" });
  }
}

export function csrfToken(): string {
  const nonce = opaqueToken();
  const expires = Math.floor(Date.now() / 1000) + 2 * 60 * 60;
  return `${nonce}.${expires}.${signature(`csrf:${nonce}:${expires}`)}`;
}

export function validCsrf(value: string): boolean {
  const [nonce, expiryText, mac, extra] = value.split(".");
  const expires = Number(expiryText);
  const now = Math.floor(Date.now() / 1000);
  return Boolean(
    nonce &&
    Number.isInteger(expires) &&
    expires > now &&
    expires <= now + 2 * 60 * 60 + 30 &&
    mac &&
    !extra &&
    equalSecret(mac, signature(`csrf:${nonce}:${expires}`)),
  );
}
