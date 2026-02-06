import { describe, test, expect } from "bun:test";
import {
  buildSetCookie,
  createAccessToken,
  createRefreshToken,
  hashToken,
  normalizeEmail,
  parseCookies,
  resolveAuthSecret,
  validatePasswordComplexity,
  verifyToken,
} from "./auth";

describe("auth helpers", () => {
  const secret = "test-secret";

  test("creates and verifies access token", () => {
    const token = createAccessToken("user-1", secret, 60);
    const payload = verifyToken(token, secret);

    expect(payload).not.toBeNull();
    expect(payload!.sub).toBe("user-1");
    expect(payload!.type).toBe("access");
  });

  test("creates and verifies refresh token", () => {
    const { token } = createRefreshToken("user-1", secret, 60);
    const payload = verifyToken(token, secret);

    expect(payload).not.toBeNull();
    expect(payload!.type).toBe("refresh");
    if (payload && payload.type === "refresh") {
      expect(payload.jti.length).toBeGreaterThan(0);
    }
  });

  test("rejects token with invalid signature", () => {
    const token = createAccessToken("user-1", secret, 60);
    const tampered = token.slice(0, -1) + "x";

    expect(verifyToken(tampered, secret)).toBeNull();
  });

  test("rejects expired token", () => {
    const token = createAccessToken("user-1", secret, -1);
    expect(verifyToken(token, secret)).toBeNull();
  });

  test("builds and parses cookies", () => {
    const setCookie = buildSetCookie("access_token", "abc", {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 900,
    });

    expect(setCookie).toContain("access_token=abc");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");

    const parsed = parseCookies("foo=bar; access_token=abc");
    expect(parsed["foo"]).toBe("bar");
    expect(parsed["access_token"]).toBe("abc");
  });

  test("validates password complexity", () => {
    expect(validatePasswordComplexity("short").valid).toBe(false);
    expect(validatePasswordComplexity("longpassword123!").valid).toBe(false);
    expect(validatePasswordComplexity("ValidPassword123!").valid).toBe(true);
  });

  test("normalizes email", () => {
    expect(normalizeEmail("  USER@Example.COM ")).toBe("user@example.com");
  });

  test("hashes token deterministically", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).not.toBe(hashToken("def"));
  });

  test("resolveAuthSecret throws when production secret is missing", () => {
    expect(() => resolveAuthSecret({ NODE_ENV: "production" })).toThrow(
      "AUTH_JWT_SECRET must be set in production",
    );
  });

  test("resolveAuthSecret returns configured secret", () => {
    const resolved = resolveAuthSecret({
      NODE_ENV: "production",
      AUTH_JWT_SECRET: "prod-secret",
    });

    expect(resolved.secret).toBe("prod-secret");
    expect(resolved.usesFallback).toBe(false);
  });

  test("resolveAuthSecret uses fallback outside production", () => {
    const resolved = resolveAuthSecret({ NODE_ENV: "development", AUTH_JWT_SECRET: "   " });

    expect(resolved.secret).toBe("dev-insecure-auth-secret-change-me-immediately");
    expect(resolved.usesFallback).toBe(true);
  });
});
