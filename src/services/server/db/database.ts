/**
 * Database connection management using bun:sqlite.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/migrations.ts
 */

import { Database } from "bun:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { DB_CONFIG } from "@/config/constants";

let db: Database | null = null;

/**
 * Get the database instance. Creates a new connection if one doesn't exist.
 * Enables foreign keys and WAL mode for better performance.
 */
export function getDatabase(path: string = DB_CONFIG.defaultPath): Database {
  if (db !== null) {
    return db;
  }

  // Ensure parent directory exists for file-based databases
  if (path !== ":memory:") {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  db = new Database(path);
  db.run("PRAGMA foreign_keys = ON");

  // Enable WAL mode for file-based databases (not in-memory)
  if (path !== ":memory:") {
    db.run("PRAGMA journal_mode = WAL");
  }

  return db;
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  if (db !== null) {
    db.close();
    db = null;
  }
}

/**
 * Reset the database by closing and creating a fresh connection.
 * Used primarily for testing.
 */
export function resetDatabase(path: string = DB_CONFIG.defaultPath): void {
  closeDatabase();
  // Create a fresh database instance
  db = new Database(path);
  db.run("PRAGMA foreign_keys = ON");
  if (path !== ":memory:") {
    db.run("PRAGMA journal_mode = WAL");
  }
}
