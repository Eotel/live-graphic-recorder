import {
  buildSetCookie,
  createAccessToken,
  createRefreshToken,
  hashToken,
  normalizeEmail,
  parseCookies,
  validatePasswordComplexity,
  verifyToken,
} from "@/services/server/auth";
import type { PersistenceService } from "@/services/server/persistence";
import type { AuthRequestBody, AuthUser } from "@/server/types/context";
import type { UserRole } from "@/types/auth";

interface CreateAuthServiceInput {
  persistence: PersistenceService;
  authSecret: string;
  accessTokenTtlSec: number;
  refreshTokenTtlSec: number;
  accessTokenCookie?: string;
  refreshTokenCookie?: string;
}

interface ParsedAuthRequest {
  email: string;
  password: string;
}

export interface AuthService {
  authSecret: string;
  accessTokenCookie: string;
  refreshTokenCookie: string;
  parseAuthRequestBody: (req: Request) => Promise<ParsedAuthRequest | null>;
  requireAuthenticatedUser: (req: Request) => AuthUser | Response;
  unauthorizedResponse: (message?: string) => Response;
  clearAuthCookies: (headers: Headers, req: Request) => void;
  issueSessionTokens: (req: Request, userId: string) => Headers;
  buildAuthUserResponse: (
    userId: string,
    email: string,
    role: UserRole,
  ) => { user: { id: string; email: string; role: UserRole } };
  validatePasswordComplexity: typeof validatePasswordComplexity;
  parseCookies: typeof parseCookies;
  hashToken: typeof hashToken;
  verifyToken: typeof verifyToken;
}

export function shouldUseSecureCookies(req: Request): boolean {
  const url = new URL(req.url);
  if (url.protocol === "https:") {
    return true;
  }

  const forwardedProto = req.headers.get("x-forwarded-proto");
  if (forwardedProto && forwardedProto.split(",")[0]?.trim() === "https") {
    return true;
  }

  return process.env["NODE_ENV"] === "production";
}

export function createAuthService(input: CreateAuthServiceInput): AuthService {
  const accessTokenCookie = input.accessTokenCookie ?? "access_token";
  const refreshTokenCookie = input.refreshTokenCookie ?? "refresh_token";

  function unauthorizedResponse(message = "Unauthorized"): Response {
    return new Response(message, { status: 401 });
  }

  async function parseAuthRequestBody(req: Request): Promise<ParsedAuthRequest | null> {
    let body: AuthRequestBody;
    try {
      body = (await req.json()) as AuthRequestBody;
    } catch {
      return null;
    }

    if (typeof body.email !== "string" || typeof body.password !== "string") {
      return null;
    }

    const email = normalizeEmail(body.email);
    if (!email || !email.includes("@")) {
      return null;
    }

    return {
      email,
      password: body.password,
    };
  }

  function getAuthenticatedUser(req: Request): AuthUser | null {
    const cookies = parseCookies(req.headers.get("cookie"));
    const accessToken = cookies[accessTokenCookie];
    if (!accessToken) {
      return null;
    }

    const payload = verifyToken(accessToken, input.authSecret);
    if (!payload || payload.type !== "access") {
      return null;
    }

    return { userId: payload.sub };
  }

  function requireAuthenticatedUser(req: Request): AuthUser | Response {
    const auth = getAuthenticatedUser(req);
    if (!auth) {
      return unauthorizedResponse();
    }
    return auth;
  }

  function setAuthCookies(
    headers: Headers,
    req: Request,
    accessToken: string,
    refreshToken: string,
  ): void {
    const secure = shouldUseSecureCookies(req);
    headers.append(
      "Set-Cookie",
      buildSetCookie(accessTokenCookie, accessToken, {
        httpOnly: true,
        secure,
        sameSite: "Lax",
        path: "/",
        maxAge: input.accessTokenTtlSec,
      }),
    );
    headers.append(
      "Set-Cookie",
      buildSetCookie(refreshTokenCookie, refreshToken, {
        httpOnly: true,
        secure,
        sameSite: "Lax",
        path: "/api/auth",
        maxAge: input.refreshTokenTtlSec,
      }),
    );
  }

  function clearAuthCookies(headers: Headers, req: Request): void {
    const secure = shouldUseSecureCookies(req);
    headers.append(
      "Set-Cookie",
      buildSetCookie(accessTokenCookie, "", {
        httpOnly: true,
        secure,
        sameSite: "Lax",
        path: "/",
        maxAge: 0,
      }),
    );
    headers.append(
      "Set-Cookie",
      buildSetCookie(refreshTokenCookie, "", {
        httpOnly: true,
        secure,
        sameSite: "Lax",
        path: "/api/auth",
        maxAge: 0,
      }),
    );
  }

  function issueSessionTokens(req: Request, userId: string): Headers {
    const headers = new Headers({ "Content-Type": "application/json" });
    const accessToken = createAccessToken(userId, input.authSecret, input.accessTokenTtlSec);
    const refresh = createRefreshToken(userId, input.authSecret, input.refreshTokenTtlSec);
    input.persistence.createRefreshToken(userId, hashToken(refresh.token), refresh.expiresAtMs);
    setAuthCookies(headers, req, accessToken, refresh.token);
    return headers;
  }

  function buildAuthUserResponse(
    userId: string,
    email: string,
    role: UserRole,
  ): { user: { id: string; email: string; role: UserRole } } {
    return { user: { id: userId, email, role } };
  }

  return {
    authSecret: input.authSecret,
    accessTokenCookie,
    refreshTokenCookie,
    parseAuthRequestBody,
    requireAuthenticatedUser,
    unauthorizedResponse,
    clearAuthCookies,
    issueSessionTokens,
    buildAuthUserResponse,
    validatePasswordComplexity,
    parseCookies,
    hashToken,
    verifyToken,
  };
}
