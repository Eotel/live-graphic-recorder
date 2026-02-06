/**
 * Refresh token repository for persistent session management.
 */

import type { Database } from "bun:sqlite";

export interface PersistedRefreshToken {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
  revokedAt: number | null;
  createdAt: number;
}

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  revoked_at: number | null;
  created_at: number;
}

function rowToRefreshToken(row: RefreshTokenRow): PersistedRefreshToken {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at,
  };
}

export interface CreateRefreshTokenInput {
  id?: string;
  userId: string;
  tokenHash: string;
  expiresAt: number;
}

export function createRefreshToken(
  db: Database,
  input: CreateRefreshTokenInput,
): PersistedRefreshToken {
  const id = input.id ?? crypto.randomUUID();
  const createdAt = Date.now();

  db.run(
    `INSERT INTO auth_refresh_tokens (id, user_id, token_hash, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, input.userId, input.tokenHash, input.expiresAt, createdAt],
  );

  const row = db.query("SELECT * FROM auth_refresh_tokens WHERE id = ?").get(id) as RefreshTokenRow;
  return rowToRefreshToken(row);
}

export function findActiveRefreshTokenByHash(
  db: Database,
  tokenHash: string,
  now: number = Date.now(),
): PersistedRefreshToken | null {
  const row = db
    .query(
      `SELECT * FROM auth_refresh_tokens
       WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
    )
    .get(tokenHash, now) as RefreshTokenRow | null;
  return row ? rowToRefreshToken(row) : null;
}

export function revokeRefreshToken(db: Database, id: string, revokedAt: number = Date.now()): void {
  db.run("UPDATE auth_refresh_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", [
    revokedAt,
    id,
  ]);
}

export function revokeAllRefreshTokensForUser(
  db: Database,
  userId: string,
  revokedAt: number = Date.now(),
): void {
  db.run("UPDATE auth_refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL", [
    revokedAt,
    userId,
  ]);
}
