/**
 * File storage service for media files (images, captures).
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/services/server/db/repository/image.ts, src/services/server/db/repository/capture.ts
 */

import { join, resolve, relative, isAbsolute } from "node:path";
import { existsSync, mkdirSync, rmSync, readdirSync } from "node:fs";
import { DB_CONFIG } from "@/config/constants";

// Pattern for valid session IDs (UUID format or session-timestamp-random format)
const VALID_SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

export class FileStorageService {
  private readonly basePath: string;
  private readonly resolvedBasePath: string;

  constructor(basePath: string = DB_CONFIG.defaultMediaPath) {
    this.basePath = basePath;
    this.resolvedBasePath = resolve(basePath);
  }

  /**
   * Validate and sanitize session ID to prevent path traversal attacks.
   * @throws Error if session ID contains invalid characters
   */
  private validateSessionId(sessionId: string): string {
    if (!sessionId || !VALID_SESSION_ID_PATTERN.test(sessionId)) {
      throw new Error(`Invalid session ID format: ${sessionId}`);
    }
    // Double-check no path traversal
    if (sessionId.includes("..") || sessionId.includes("/") || sessionId.includes("\\")) {
      throw new Error(`Invalid session ID: path traversal detected`);
    }
    return sessionId;
  }

  /**
   * Validate that a file path is within the allowed base path.
   * @throws Error if path is outside base directory
   */
  private validateFilePath(filePath: string): string {
    const resolvedPath = resolve(filePath);
    const rel = relative(this.resolvedBasePath, resolvedPath);
    // Reject anything that escapes the base directory (including lookalike prefixes).
    if (
      rel === "" ||
      rel === ".." ||
      rel.startsWith("../") ||
      rel.startsWith("..\\") ||
      isAbsolute(rel)
    ) {
      throw new Error(`Access denied: path outside media directory`);
    }
    return resolvedPath;
  }

  /**
   * Save a generated image to disk.
   * @throws Error if sessionId contains invalid characters
   */
  async saveImage(
    sessionId: string,
    base64: string,
    type: "png" | "jpeg",
  ): Promise<{ filePath: string }> {
    const validSessionId = this.validateSessionId(sessionId);
    const dir = this.getImageDir(validSessionId);
    this.ensureDir(dir);

    const ext = type === "jpeg" ? "jpg" : "png";
    const filename = `${Date.now()}.${ext}`;
    const filePath = join(dir, filename);

    const buffer = Buffer.from(base64, "base64");
    await Bun.write(filePath, buffer);

    return { filePath };
  }

  /**
   * Save a camera capture to disk.
   * @throws Error if sessionId contains invalid characters
   */
  async saveCapture(sessionId: string, base64: string): Promise<{ filePath: string }> {
    const validSessionId = this.validateSessionId(sessionId);
    const dir = this.getCaptureDir(validSessionId);
    this.ensureDir(dir);

    const filename = `${Date.now()}.jpg`;
    const filePath = join(dir, filename);

    const buffer = Buffer.from(base64, "base64");
    await Bun.write(filePath, buffer);

    return { filePath };
  }

  /**
   * Load an image from disk as base64.
   * @throws Error if path is outside media directory or file not found
   */
  async loadImage(filePath: string): Promise<string> {
    const validPath = this.validateFilePath(filePath);
    const file = Bun.file(validPath);
    if (!(await file.exists())) {
      throw new Error(`File not found: ${filePath}`);
    }
    const buffer = await file.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  }

  /**
   * Delete all media files for a session.
   * Returns the number of files deleted.
   * @throws Error if sessionId contains invalid characters
   */
  async deleteSessionMedia(sessionId: string): Promise<number> {
    const validSessionId = this.validateSessionId(sessionId);
    let count = 0;

    const imageDir = this.getImageDir(validSessionId);
    if (existsSync(imageDir)) {
      const files = readdirSync(imageDir);
      count += files.length;
      rmSync(imageDir, { recursive: true });
    }

    const captureDir = this.getCaptureDir(validSessionId);
    if (existsSync(captureDir)) {
      const files = readdirSync(captureDir);
      count += files.length;
      rmSync(captureDir, { recursive: true });
    }

    return count;
  }

  private getImageDir(sessionId: string): string {
    // sessionId should already be validated at this point
    return join(this.basePath, "images", sessionId);
  }

  private getCaptureDir(sessionId: string): string {
    // sessionId should already be validated at this point
    return join(this.basePath, "captures", sessionId);
  }

  private ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}
