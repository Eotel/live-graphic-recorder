/**
 * User repository tests.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { closeDatabase, getDatabase } from "../database";
import { runMigrations } from "../migrations";
import { createUser, findUserByEmail, findUserById, findUsers, updateUserRole } from "./user";

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
    expect(user.role).toBe("user");
  });

  test("creates a user with explicit role", () => {
    const db = getDatabase(testDbPath);

    const user = createUser(db, {
      email: "staff@example.com",
      passwordHash: "hash-value",
      role: "staff",
    });

    expect(user.role).toBe("staff");
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

  test("lists users ordered by created_at", async () => {
    const db = getDatabase(testDbPath);
    createUser(db, {
      email: "first@example.com",
      passwordHash: "hash-value",
    });
    await new Promise((resolve) => setTimeout(resolve, 1));
    createUser(db, {
      email: "second@example.com",
      passwordHash: "hash-value",
    });

    const users = findUsers(db);
    expect(users).toHaveLength(2);
    expect(users[0]!.email).toBe("first@example.com");
    expect(users[1]!.email).toBe("second@example.com");
  });

  test("updates user role", () => {
    const db = getDatabase(testDbPath);
    const user = createUser(db, {
      email: "role@example.com",
      passwordHash: "hash-value",
    });

    const updated = updateUserRole(db, user.id, "admin");
    expect(updated).not.toBeNull();
    expect(updated?.role).toBe("admin");
    expect(findUserById(db, user.id)?.role).toBe("admin");
  });
});
