import { describe, expect, test } from "bun:test";
import { getMediaContentTypeFromPath, isPathWithinBaseDir } from "./path-policy";

describe("isPathWithinBaseDir", () => {
  test("allows file paths inside base dir", () => {
    const ok = isPathWithinBaseDir("/tmp/media", "/tmp/media/images/a.png");
    expect(ok).toBe(true);
  });

  test("rejects traversal outside base dir", () => {
    const ok = isPathWithinBaseDir("/tmp/media", "/tmp/media/../secret.txt");
    expect(ok).toBe(false);
  });
});

describe("getMediaContentTypeFromPath", () => {
  test("returns known content types", () => {
    expect(getMediaContentTypeFromPath("a.png")).toBe("image/png");
    expect(getMediaContentTypeFromPath("a.jpg")).toBe("image/jpeg");
    expect(getMediaContentTypeFromPath("a.webm")).toBe("audio/webm");
  });

  test("falls back to octet stream", () => {
    expect(getMediaContentTypeFromPath("a.bin")).toBe("application/octet-stream");
  });
});
