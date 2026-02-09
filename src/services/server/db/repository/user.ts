/**
 * User repository for authentication-related database operations.
 */

import type { Database } from "bun:sqlite";
import { isUserRole, type UserRole } from "@/types/auth";

export interface PersistedUser {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: number;
  role: UserRole;
}

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  created_at: number;
  role: string;
}

function rowToUser(row: UserRow): PersistedUser {
  const role = isUserRole(row.role) ? row.role : "user";
  return {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    role,
  };
}

export interface CreateUserInput {
  id?: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
}

export function createUser(db: Database, input: CreateUserInput): PersistedUser {
  const id = input.id ?? crypto.randomUUID();
  const createdAt = Date.now();
  const role = input.role ?? "user";

  db.run(`INSERT INTO users (id, email, password_hash, created_at, role) VALUES (?, ?, ?, ?, ?)`, [
    id,
    input.email,
    input.passwordHash,
    createdAt,
    role,
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

export function findUsers(db: Database, limit?: number): PersistedUser[] {
  const query = limit
    ? "SELECT * FROM users ORDER BY created_at ASC LIMIT ?"
    : "SELECT * FROM users ORDER BY created_at ASC";
  const rows = (limit ? db.query(query).all(limit) : db.query(query).all()) as UserRow[];
  return rows.map(rowToUser);
}

export function updateUserRole(db: Database, userId: string, role: UserRole): PersistedUser | null {
  db.run("UPDATE users SET role = ? WHERE id = ?", [role, userId]);
  const row = db.query("SELECT * FROM users WHERE id = ?").get(userId) as UserRow | null;
  return row ? rowToUser(row) : null;
}
