/**
 * File storage service tests.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/storage/file-storage.ts
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { FileStorageService } from "./file-storage";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("FileStorageService", () => {
  const testMediaPath = "/tmp/test-media-storage";
  let storage: FileStorageService;

  beforeEach(() => {
    // Clean up test directory
    if (existsSync(testMediaPath)) {
      rmSync(testMediaPath, { recursive: true });
    }
    storage = new FileStorageService(testMediaPath);
  });

  afterEach(() => {
    // Clean up test directory
    if (existsSync(testMediaPath)) {
      rmSync(testMediaPath, { recursive: true });
    }
  });

  describe("saveImage", () => {
    test("saves PNG image and returns file path", async () => {
      const sessionId = "test-session-1";
      // Minimal valid PNG (1x1 transparent pixel)
      const base64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      const result = await storage.saveImage(sessionId, base64, "png");

      expect(result.filePath).toContain(sessionId);
      expect(result.filePath).toEndWith(".png");
      expect(existsSync(result.filePath)).toBe(true);
    });

    test("saves JPEG image and returns file path", async () => {
      const sessionId = "test-session-2";
      // Minimal JPEG (1x1 red pixel)
      const base64 =
        "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwAB/AA==";

      const result = await storage.saveImage(sessionId, base64, "jpeg");

      expect(result.filePath).toContain(sessionId);
      expect(result.filePath).toEndWith(".jpg");
      expect(existsSync(result.filePath)).toBe(true);
    });

    test("creates session directory if not exists", async () => {
      const sessionId = "new-session";
      const base64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      const sessionDir = join(testMediaPath, "images", sessionId);
      expect(existsSync(sessionDir)).toBe(false);

      await storage.saveImage(sessionId, base64, "png");

      expect(existsSync(sessionDir)).toBe(true);
    });
  });

  describe("saveCapture", () => {
    test("saves camera capture and returns file path", async () => {
      const sessionId = "test-session-3";
      const base64 =
        "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBEQCEAwEPwAB/AA==";

      const result = await storage.saveCapture(sessionId, base64);

      expect(result.filePath).toContain(sessionId);
      expect(result.filePath).toContain("captures");
      expect(result.filePath).toEndWith(".jpg");
      expect(existsSync(result.filePath)).toBe(true);
    });
  });

  describe("loadImage", () => {
    test("loads saved image as base64", async () => {
      const sessionId = "test-session-load";
      const originalBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      const { filePath } = await storage.saveImage(sessionId, originalBase64, "png");
      const loadedBase64 = await storage.loadImage(filePath);

      expect(loadedBase64).toBe(originalBase64);
    });

    test("throws error for non-existent file", async () => {
      await expect(storage.loadImage("/non/existent/path.png")).rejects.toThrow();
    });
  });

  describe("deleteSessionMedia", () => {
    test("deletes all media for session", async () => {
      const sessionId = "test-session-delete";
      const base64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      const { filePath: imagePath } = await storage.saveImage(sessionId, base64, "png");
      const { filePath: capturePath } = await storage.saveCapture(sessionId, base64);

      expect(existsSync(imagePath)).toBe(true);
      expect(existsSync(capturePath)).toBe(true);

      const count = await storage.deleteSessionMedia(sessionId);

      expect(count).toBe(2);
      expect(existsSync(imagePath)).toBe(false);
      expect(existsSync(capturePath)).toBe(false);
    });

    test("returns 0 for session with no media", async () => {
      const count = await storage.deleteSessionMedia("non-existent-session");

      expect(count).toBe(0);
    });
  });

  describe("security validation", () => {
    test("rejects session ID with path traversal (..)", async () => {
      const base64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      await expect(storage.saveImage("../../../etc", base64, "png")).rejects.toThrow(
        "Invalid session ID",
      );
    });

    test("rejects session ID with forward slash", async () => {
      const base64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      await expect(storage.saveImage("session/attack", base64, "png")).rejects.toThrow(
        "Invalid session ID",
      );
    });

    test("rejects session ID with backslash", async () => {
      const base64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      await expect(storage.saveImage("session\\attack", base64, "png")).rejects.toThrow(
        "Invalid session ID",
      );
    });

    test("rejects empty session ID", async () => {
      const base64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      await expect(storage.saveImage("", base64, "png")).rejects.toThrow("Invalid session ID");
    });

    test("rejects loadImage path outside base directory", async () => {
      await expect(storage.loadImage("/etc/passwd")).rejects.toThrow(
        "Access denied: path outside media directory",
      );
    });

    test("rejects loadImage path traversal attempt", async () => {
      await expect(
        storage.loadImage(join(testMediaPath, "..", "..", "etc", "passwd")),
      ).rejects.toThrow("Access denied: path outside media directory");
    });

    test("rejects loadImage path that only shares a prefix with base directory", async () => {
      await expect(storage.loadImage(`${testMediaPath}-evil/file.png`)).rejects.toThrow(
        "Access denied: path outside media directory",
      );
    });

    test("allows valid session ID with hyphens and underscores", async () => {
      const sessionId = "session-2024_01_29-abc123";
      const base64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

      const result = await storage.saveImage(sessionId, base64, "png");

      expect(result.filePath).toContain(sessionId);
      expect(existsSync(result.filePath)).toBe(true);
    });
  });
});
