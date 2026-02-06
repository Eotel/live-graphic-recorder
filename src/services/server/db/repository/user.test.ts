/**
 * User repository tests.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeDatabase, getDatabase } from "../database";
import { runMigrations } from "../migrations";
import { createUser, findUserByEmail, findUserById } from "./user";

describe("UserRepository", () => {
  const testDbPath = ":memory:";

  beforeEach(() => {
    closeDatabase();
    const db = getDatabase(testDbPath);
    runMigrations(db);
  });

  afterEach(() => {
    closeDatabase();
  });

  test("creates a user", () => {
    const db = getDatabase(testDbPath);

    const user = createUser(db, {
      email: "alice@example.com",
      passwordHash: "hash-value",
    });

    expect(user.id).toBeDefined();
    expect(user.email).toBe("alice@example.com");
    expect(user.passwordHash).toBe("hash-value");
    expect(user.createdAt).toBeGreaterThan(0);
  });

  test("finds user by id", () => {
    const db = getDatabase(testDbPath);
    const created = createUser(db, {
      email: "alice@example.com",
      passwordHash: "hash-value",
    });

    const found = findUserById(db, created.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  test("finds user by email", () => {
    const db = getDatabase(testDbPath);
    createUser(db, {
      email: "alice@example.com",
      passwordHash: "hash-value",
    });

    const found = findUserByEmail(db, "alice@example.com");

    expect(found).not.toBeNull();
    expect(found!.email).toBe("alice@example.com");
  });

  test("returns null when user does not exist", () => {
    const db = getDatabase(testDbPath);

    expect(findUserById(db, "missing")).toBeNull();
    expect(findUserByEmail(db, "missing@example.com")).toBeNull();
  });
});
