import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { NodeResponse } from "@nestjs/platform-node";
import {
  AdminStatusSchema,
  ChangePasswordSchema,
  CreateAdminSchema,
  LoginSchema,
  ResetPasswordSchema,
} from "@sazeh/contracts";
import {
  OpenRoute,
  PasswordChangeRoute,
  SuperuserRoute,
  type AuthenticatedRequest,
} from "./access.guard.js";
import { IdentityService } from "./identity.service.js";
import { csrfToken, opaqueToken, validCsrf } from "./tokens.js";

const refreshCookie = "sazeh_refresh";
const csrfCookie = "sazeh_csrf";

@Controller("v1/auth")
export class AuthController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}

  @Get("csrf")
  @OpenRoute()
  csrf(@Req() request: AuthenticatedRequest, @Res({ passthrough: true }) response: NodeResponse) {
    const current = readCookie(request.headers.cookie, csrfCookie);
    const token = current && validCsrf(current) ? current : csrfToken();
    if (token !== current)
      response.append("Set-Cookie", cookie(csrfCookie, token, "/", 2 * 60 * 60, false));
    return { csrfToken: token };
  }

  @Post("login")
  @HttpCode(200)
  @OpenRoute()
  async login(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: NodeResponse,
  ) {
    const parsed = LoginSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: "INVALID_LOGIN",
        message: "Enter a valid username and password",
      });
    const result = await this.identity.login(
      parsed.data.username,
      parsed.data.password,
      request.ip ?? "unknown",
    );
    response.append(
      "Set-Cookie",
      cookie(
        refreshCookie,
        result.refresh,
        "/api/v1/auth",
        Math.ceil((result.expires.getTime() - Date.now()) / 1000),
        true,
      ),
    );
    return result.result;
  }

  @Post("refresh")
  @HttpCode(200)
  @OpenRoute()
  async refresh(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: NodeResponse,
  ) {
    const result = await this.identity.refresh(readCookie(request.headers.cookie, refreshCookie));
    response.append(
      "Set-Cookie",
      cookie(
        refreshCookie,
        result.refresh,
        "/api/v1/auth",
        Math.ceil((result.expires.getTime() - Date.now()) / 1000),
        true,
      ),
    );
    return result.result;
  }

  @Post("logout")
  @OpenRoute()
  @HttpCode(204)
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: NodeResponse,
  ): Promise<void> {
    const authorization = readHeader(request.header("authorization"));
    const accessToken = authorization?.startsWith("Bearer ")
      ? authorization.slice("Bearer ".length)
      : undefined;
    const result = await this.identity.logout(
      readCookie(request.headers.cookie, refreshCookie),
      accessToken,
    );
    if (result.sessionMismatch) response.setHeader("X-Session-Mismatch", "true");
    if (result.clearRefreshCookie)
      response.append("Set-Cookie", cookie(refreshCookie, "", "/api/v1/auth", 0, true));
  }

  @Get("me")
  async me(@Req() request: AuthenticatedRequest) {
    return this.identity.me(requirePrincipal(request));
  }

  @Post("password")
  @PasswordChangeRoute()
  @HttpCode(204)
  async changePassword(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: NodeResponse,
  ): Promise<void> {
    const parsed = ChangePasswordSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: "INVALID_PASSWORD",
        message: "New password must contain at least 14 characters",
      });
    await this.identity.changePassword(
      requirePrincipal(request),
      parsed.data.currentPassword,
      parsed.data.newPassword,
    );
    response.append("Set-Cookie", cookie(refreshCookie, "", "/api/v1/auth", 0, true));
  }

  @Post("sessions/revoke")
  @HttpCode(204)
  async revokeSessions(@Req() request: AuthenticatedRequest): Promise<void> {
    await this.identity.revokeSessions(requirePrincipal(request));
  }
}

@Controller("v1/admins")
@SuperuserRoute()
export class AdminsController {
  constructor(@Inject(IdentityService) private readonly identity: IdentityService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest) {
    return { admins: await this.identity.listAdmins(requirePrincipal(request)) };
  }

  @Post()
  async create(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const parsed = CreateAdminSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: "INVALID_ADMIN",
        message: "Admin details are invalid",
      });
    const temporaryPassword = opaqueToken();
    const admin = await this.identity.createAdmin(requirePrincipal(request), {
      ...parsed.data,
      temporaryPassword,
    });
    return { admin, temporaryPassword };
  }

  @Post(":id/status")
  async setStatus(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    const id = request.params.id;
    if (
      typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      throw new BadRequestException({ code: "INVALID_ID", message: "Admin ID must be a UUID" });
    }
    const parsed = AdminStatusSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: "INVALID_STATUS",
        message: "Account status is invalid",
      });
    const admin = await this.identity.mutateAdmin(requirePrincipal(request), id, {
      kind: "status",
      active: parsed.data.active,
    });
    return { admin };
  }

  @Post(":id/reset-password")
  async resetPassword(@Body() body: unknown, @Req() request: AuthenticatedRequest) {
    if (!ResetPasswordSchema.safeParse(body).success)
      throw new BadRequestException({ code: "INVALID_RESET", message: "Reset request is invalid" });
    const id = request.params.id;
    if (
      typeof id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      throw new BadRequestException({ code: "INVALID_ID", message: "Admin ID must be a UUID" });
    }
    const temporaryPassword = opaqueToken();
    const admin = await this.identity.mutateAdmin(requirePrincipal(request), id, {
      kind: "reset",
      temporaryPassword,
    });
    return { admin, temporaryPassword };
  }
}

function requirePrincipal(request: AuthenticatedRequest) {
  if (!request.principal) throw new Error("Access guard did not attach a principal");
  return request.principal;
}

function readHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function readCookie(header: string | string[] | undefined, name: string): string | undefined {
  for (const value of Array.isArray(header) ? header : [header ?? ""]) {
    for (const part of value.split(";")) {
      const separator = part.indexOf("=");
      if (separator < 0) continue;
      if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
    }
  }
  return undefined;
}

function cookie(
  name: string,
  value: string,
  path: string,
  maxAge: number,
  httpOnly: boolean,
): string {
  const configured = process.env.AUTH_ALLOWED_ORIGIN ?? "";
  const secure = !isLoopbackHttp(configured);
  const attributes = [
    `${name}=${value}`,
    `Path=${path}`,
    "SameSite=Lax",
    `Max-Age=${Math.max(0, maxAge)}`,
    ...(httpOnly ? ["HttpOnly"] : []),
    ...(secure ? ["Secure"] : []),
  ];
  return attributes.join("; ");
}

function isLoopbackHttp(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      process.env.APP_ENV === "local" &&
      url.protocol === "http:" &&
      ["localhost", "127.0.0.1", "::1"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}
