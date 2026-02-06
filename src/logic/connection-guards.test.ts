import { describe, expect, test } from "bun:test";
import { shouldAutoConnect } from "./connection-guards";

describe("shouldAutoConnect", () => {
  test("returns true when authenticated, disconnected, and not logging out", () => {
    expect(shouldAutoConnect("authenticated", false, false)).toBe(true);
  });

  test("returns false while logout is in progress", () => {
    expect(shouldAutoConnect("authenticated", false, true)).toBe(false);
  });

  test("returns false when already connected", () => {
    expect(shouldAutoConnect("authenticated", true, false)).toBe(false);
  });

  test("returns false for unauthenticated statuses", () => {
    expect(shouldAutoConnect("unauthenticated", false, false)).toBe(false);
    expect(shouldAutoConnect("loading", false, false)).toBe(false);
  });
});
