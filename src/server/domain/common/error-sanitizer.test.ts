import { describe, expect, test } from "bun:test";
import { sanitizeErrorMessage } from "./error-sanitizer";

describe("sanitizeErrorMessage", () => {
  test("hides internal-looking messages", () => {
    const result = sanitizeErrorMessage(new Error("ENOENT /tmp/secret"));
    expect(result).toBe("An internal error occurred");
  });

  test("returns generic message for non-error", () => {
    expect(sanitizeErrorMessage("bad")).toBe("An unexpected error occurred");
  });

  test("truncates long message", () => {
    const long = "x".repeat(250);
    const result = sanitizeErrorMessage(new Error(long));
    expect(result.length).toBe(203);
    expect(result.endsWith("...")).toBe(true);
  });
});
