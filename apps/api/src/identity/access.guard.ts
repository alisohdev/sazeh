import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { validCsrf, verifyAccess } from "./tokens.js";
import { IdentityService, type Principal } from "./identity.service.js";

const OPEN = "sazeh:open-route";
const PASSWORD_CHANGE = "sazeh:password-change-route";
const SUPERUSER = "sazeh:superuser-route";

export const OpenRoute = () => SetMetadata(OPEN, true);
export const PasswordChangeRoute = () => SetMetadata(PASSWORD_CHANGE, true);
export const SuperuserRoute = () => SetMetadata(SUPERUSER, true);

export type AuthenticatedRequest = Request & { principal?: Principal };

@Injectable()
export class AccessGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(IdentityService) private readonly identity: IdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const handler = context.getHandler();
    const controller = context.getClass();
    const isOpen = this.reflector.getAllAndOverride<boolean>(OPEN, [handler, controller]) ?? false;
    const isPasswordChange =
      this.reflector.getAllAndOverride<boolean>(PASSWORD_CHANGE, [handler, controller]) ?? false;
    const isSuperuser =
      this.reflector.getAllAndOverride<boolean>(SUPERUSER, [handler, controller]) ?? false;

    if (["POST", "PUT", "PATCH", "DELETE"].includes(request.method.toUpperCase())) {
      this.assertSameOriginAndCsrf(request);
    }
    if (isOpen) return true;

    const authorization = request.header("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      throw new UnauthorizedException({ code: "AUTH_REQUIRED", message: "Sign in to continue" });
    }
    const claims = verifyAccess(authorization.slice(7));
    const principal = await this.identity.authenticate(claims, isPasswordChange);
    if (isSuperuser && (principal.kind !== "workspace" || principal.role !== "SUPERUSER")) {
      throw new ForbiddenException({
        code: "SUPERUSER_REQUIRED",
        message: "Superuser access is required",
      });
    }
    request.principal = principal;
    return true;
  }

  private assertSameOriginAndCsrf(request: Request): void {
    const configured = process.env.AUTH_ALLOWED_ORIGIN;
    let allowed: string;
    try {
      if (!configured) throw new Error("missing origin");
      const url = new URL(configured);
      if (url.origin !== configured || (url.protocol !== "https:" && url.protocol !== "http:")) {
        throw new Error("invalid origin");
      }
      allowed = url.origin;
    } catch {
      throw new ForbiddenException({
        code: "ORIGIN_NOT_CONFIGURED",
        message: "Browser origin is not configured",
      });
    }

    if (request.header("origin") !== allowed) {
      throw new ForbiddenException({
        code: "ORIGIN_REJECTED",
        message: "Request origin is not allowed",
      });
    }
    if (!request.is("application/json")) {
      throw new ForbiddenException({
        code: "CSRF_REJECTED",
        message: "JSON requests are required",
      });
    }
    const csrfCookie = readCookie(request.headers.cookie, "sazeh_csrf");
    const csrfHeader = request.header("x-csrf-token");
    if (!csrfCookie || !csrfHeader || csrfCookie !== csrfHeader || !validCsrf(csrfCookie)) {
      throw new ForbiddenException({
        code: "CSRF_REJECTED",
        message: "Request verification failed",
      });
    }
  }
}

function readCookie(header: string | undefined, name: string): string | undefined {
  for (const part of header?.split(";") ?? []) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return undefined;
}
