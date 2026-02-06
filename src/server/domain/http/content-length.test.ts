import { describe, expect, test } from "bun:test";
import { parseContentLengthHeader } from "./content-length";

describe("parseContentLengthHeader", () => {
  test("parses valid integer", () => {
    expect(parseContentLengthHeader("123")).toBe(123);
  });

  test("returns null for invalid values", () => {
    expect(parseContentLengthHeader("12.3")).toBeNull();
    expect(parseContentLengthHeader("abc")).toBeNull();
  });
});
