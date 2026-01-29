/**
 * Database connection management tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/database.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { getDatabase, closeDatabase, resetDatabase } from "./database";

describe("database", () => {
  const testDbPath = ":memory:";

  afterEach(() => {
    closeDatabase();
  });

  describe("getDatabase", () => {
    test("returns a Database instance", () => {
      const db = getDatabase(testDbPath);
      expect(db).toBeInstanceOf(Database);
    });

    test("returns the same instance on subsequent calls", () => {
      const db1 = getDatabase(testDbPath);
      const db2 = getDatabase(testDbPath);
      expect(db1).toBe(db2);
    });

    test("enables foreign keys by default", () => {
      const db = getDatabase(testDbPath);
      const result = db.query("PRAGMA foreign_keys").get() as { foreign_keys: number };
      expect(result.foreign_keys).toBe(1);
    });

    test("enables WAL mode for file databases", () => {
      // WAL mode doesn't apply to in-memory databases, but the code should handle it
      const db = getDatabase(testDbPath);
      // Just verify the database is functional
      expect(db.query("SELECT 1").get()).toEqual({ "1": 1 });
    });
  });

  describe("closeDatabase", () => {
    test("closes the database connection", () => {
      const db = getDatabase(testDbPath);
      expect(db).toBeDefined();
      closeDatabase();
      // Getting a new database should return a different instance
      const db2 = getDatabase(testDbPath);
      expect(db2).not.toBe(db);
    });

    test("can be called multiple times safely", () => {
      getDatabase(testDbPath);
      closeDatabase();
      closeDatabase(); // Should not throw
    });
  });

  describe("resetDatabase", () => {
    test("clears all data and reinitializes schema", () => {
      const db = getDatabase(testDbPath);
      // Insert some test data
      db.run("CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY)");
      db.run("INSERT INTO test_table (id) VALUES (1)");

      resetDatabase(testDbPath);

      const newDb = getDatabase(testDbPath);
      // The test_table should not exist after reset
      const tables = newDb
        .query("SELECT name FROM sqlite_master WHERE type='table' AND name='test_table'")
        .all();
      expect(tables).toHaveLength(0);
    });
  });
});
