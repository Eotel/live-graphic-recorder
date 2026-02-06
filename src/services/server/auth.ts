/**
 * Authentication helpers (JWT, cookie, validation).
 */

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export interface AccessTokenPayload {
  sub: string;
  type: "access";
  iat: number;
  exp: number;
}

export interface RefreshTokenPayload {
  sub: string;
  type: "refresh";
  jti: string;
  iat: number;
  exp: number;
}

export type AuthTokenPayload = AccessTokenPayload | RefreshTokenPayload;

const JWT_HEADER = {
  alg: "HS256",
  typ: "JWT",
} as const;

const PASSWORD_COMPLEXITY = {
  minLength: 12,
  hasUppercase: /[A-Z]/,
  hasLowercase: /[a-z]/,
  hasDigit: /\d/,
  hasSymbol: /[^A-Za-z0-9]/,
} as const;

const DEV_FALLBACK_AUTH_SECRET = "dev-insecure-auth-secret-change-me-immediately";

export interface AuthSecretEnv {
  AUTH_JWT_SECRET?: string;
  NODE_ENV?: string;
}

export interface ResolvedAuthSecret {
  secret: string;
  usesFallback: boolean;
}

export function resolveAuthSecret(env: AuthSecretEnv): ResolvedAuthSecret {
  const rawSecret = env.AUTH_JWT_SECRET;
  if (rawSecret && rawSecret.trim().length > 0) {
    return { secret: rawSecret, usesFallback: false };
  }
  if (env.NODE_ENV === "production") {
    throw new Error("AUTH_JWT_SECRET must be set in production");
  }
  return {
    secret: DEV_FALLBACK_AUTH_SECRET,
    usesFallback: true,
  };
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecode(value: string): Buffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function signData(data: string, secret: string): string {
  const signature = createHmac("sha256", secret).update(data).digest();
  return base64UrlEncode(signature);
}

function signPayload(payload: AuthTokenPayload, secret: string): string {
  const encodedHeader = base64UrlEncode(JSON.stringify(JWT_HEADER));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signature = signData(unsignedToken, secret);
  return `${unsignedToken}.${signature}`;
}

export function verifyToken(token: string, secret: string): AuthTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, receivedSignature] = parts;
  if (!encodedHeader || !encodedPayload || !receivedSignature) {
    return null;
  }

  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = signData(unsignedToken, secret);

  const receivedBuffer = Buffer.from(receivedSignature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    receivedBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(receivedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const header = JSON.parse(base64UrlDecode(encodedHeader).toString("utf8")) as {
      alg?: string;
      typ?: string;
    };
    if (header.alg !== "HS256" || header.typ !== "JWT") {
      return null;
    }

    const payload = JSON.parse(
      base64UrlDecode(encodedPayload).toString("utf8"),
    ) as AuthTokenPayload;
    if (
      !payload.sub ||
      !payload.type ||
      typeof payload.exp !== "number" ||
      typeof payload.iat !== "number"
    ) {
      return null;
    }

    if (payload.type === "refresh" && !payload.jti) {
      return null;
    }

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp <= now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function createAccessToken(userId: string, secret: string, expiresInSec = 15 * 60): string {
  const iat = Math.floor(Date.now() / 1000);
  return signPayload(
    {
      sub: userId,
      type: "access",
      iat,
      exp: iat + expiresInSec,
    },
    secret,
  );
}

export function createRefreshToken(
  userId: string,
  secret: string,
  expiresInSec = 30 * 24 * 60 * 60,
): { token: string; tokenId: string; expiresAtMs: number } {
  const iat = Math.floor(Date.now() / 1000);
  const tokenId = randomUUID();
  const token = signPayload(
    {
      sub: userId,
      type: "refresh",
      jti: tokenId,
      iat,
      exp: iat + expiresInSec,
    },
    secret,
  );

  return {
    token,
    tokenId,
    expiresAtMs: (iat + expiresInSec) * 1000,
  };
}

export interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
  path?: string;
  maxAge?: number;
}

export function buildSetCookie(name: string, value: string, options: CookieOptions = {}): string {
  const segments = [`${name}=${encodeURIComponent(value)}`];

  segments.push(`Path=${options.path ?? "/"}`);

  if (typeof options.maxAge === "number") {
    segments.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }
  if (options.httpOnly) {
    segments.push("HttpOnly");
  }
  if (options.secure) {
    segments.push("Secure");
  }
  if (options.sameSite) {
    segments.push(`SameSite=${options.sameSite}`);
  }

  return segments.join("; ");
}

export function parseCookies(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const parsed: Record<string, string> = {};
  const pairs = cookieHeader.split(";");
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx < 0) continue;
    const name = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!name) continue;
    try {
      parsed[name] = decodeURIComponent(value);
    } catch {
      parsed[name] = value;
    }
  }

  return parsed;
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function validatePasswordComplexity(password: string): { valid: boolean; reason?: string } {
  if (password.length < PASSWORD_COMPLEXITY.minLength) {
    return { valid: false, reason: "Password must be at least 12 characters" };
  }
  if (!PASSWORD_COMPLEXITY.hasUppercase.test(password)) {
    return { valid: false, reason: "Password must include an uppercase letter" };
  }
  if (!PASSWORD_COMPLEXITY.hasLowercase.test(password)) {
    return { valid: false, reason: "Password must include a lowercase letter" };
  }
  if (!PASSWORD_COMPLEXITY.hasDigit.test(password)) {
    return { valid: false, reason: "Password must include a digit" };
  }
  if (!PASSWORD_COMPLEXITY.hasSymbol.test(password)) {
    return { valid: false, reason: "Password must include a symbol" };
  }
  return { valid: true };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
