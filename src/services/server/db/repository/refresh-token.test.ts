/**
 * Refresh token repository tests.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeDatabase, getDatabase } from "../database";
import { runMigrations } from "../migrations";
import { createUser } from "./user";
import {
  createRefreshToken,
  findActiveRefreshTokenByHash,
  revokeAllRefreshTokensForUser,
  revokeRefreshToken,
} from "./refresh-token";

describe("RefreshTokenRepository", () => {
  const testDbPath = ":memory:";
  let userId = "";

  beforeEach(() => {
    closeDatabase();
    const db = getDatabase(testDbPath);
    runMigrations(db);

    const user = createUser(db, {
      email: "alice@example.com",
      passwordHash: "hash-value",
    });
    userId = user.id;
  });

  afterEach(() => {
    closeDatabase();
  });

  test("creates and finds active refresh token", () => {
    const db = getDatabase(testDbPath);
    const now = Date.now();

    createRefreshToken(db, {
      userId,
      tokenHash: "token-hash-1",
      expiresAt: now + 60_000,
    });

    const found = findActiveRefreshTokenByHash(db, "token-hash-1", now);

    expect(found).not.toBeNull();
    expect(found!.userId).toBe(userId);
    expect(found!.revokedAt).toBeNull();
  });

  test("does not return expired token", () => {
    const db = getDatabase(testDbPath);
    const now = Date.now();

    createRefreshToken(db, {
      userId,
      tokenHash: "token-hash-expired",
      expiresAt: now - 1,
    });

    const found = findActiveRefreshTokenByHash(db, "token-hash-expired", now);
    expect(found).toBeNull();
  });

  test("does not return revoked token", () => {
    const db = getDatabase(testDbPath);
    const now = Date.now();

    const token = createRefreshToken(db, {
      userId,
      tokenHash: "token-hash-revoked",
      expiresAt: now + 60_000,
    });

    revokeRefreshToken(db, token.id, now + 1000);

    const found = findActiveRefreshTokenByHash(db, "token-hash-revoked", now + 2000);
    expect(found).toBeNull();
  });

  test("revokes all refresh tokens for user", () => {
    const db = getDatabase(testDbPath);
    const now = Date.now();

    createRefreshToken(db, {
      userId,
      tokenHash: "token-hash-1",
      expiresAt: now + 60_000,
    });
    createRefreshToken(db, {
      userId,
      tokenHash: "token-hash-2",
      expiresAt: now + 60_000,
    });

    revokeAllRefreshTokensForUser(db, userId, now + 500);

    expect(findActiveRefreshTokenByHash(db, "token-hash-1", now + 1000)).toBeNull();
    expect(findActiveRefreshTokenByHash(db, "token-hash-2", now + 1000)).toBeNull();
  });
});
