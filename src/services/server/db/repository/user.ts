/**
 * User repository for authentication-related database operations.
 */

import type { Database } from "bun:sqlite";

export interface PersistedUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: number;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
}

function rowToUser(row: UserRow): PersistedUser {
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
  };
}

export interface CreateUserInput {
  id?: string;
  email: string;
  passwordHash: string;
}

export function createUser(db: Database, input: CreateUserInput): PersistedUser {
  const id = input.id ?? crypto.randomUUID();
  const createdAt = Date.now();

  db.run(`INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`, [
    id,
    input.email,
    input.passwordHash,
    createdAt,
  ]);

  const row = db.query("SELECT * FROM users WHERE id = ?").get(id) as UserRow;
  return rowToUser(row);
}

export function findUserById(db: Database, userId: string): PersistedUser | null {
  const row = db.query("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | null;
  return row ? rowToUser(row) : null;
}

export function findUserByEmail(db: Database, email: string): PersistedUser | null {
  const row = db.query("SELECT * FROM users WHERE email = ?").get(email) as UserRow | null;
  return row ? rowToUser(row) : null;
}
