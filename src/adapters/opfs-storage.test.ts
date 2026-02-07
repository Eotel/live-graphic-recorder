/**
 * OPFS Storage Adapter tests.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/adapters/opfs-storage.ts
 */

import { describe, test, expect, beforeEach } from "bun:test";
import type { OPFSStorageAdapter } from "./opfs-storage";
import { createMockOPFSStorageAdapter } from "./opfs-storage";

describe("OPFSStorageAdapter (mock)", () => {
  let adapter: OPFSStorageAdapter;

  beforeEach(() => {
    adapter = createMockOPFSStorageAdapter();
  });

  describe("createAudioFile", () => {
    test("returns a writer for the session", async () => {
      const writer = await adapter.createAudioFile("session-1");

      expect(writer).toBeDefined();
      expect(typeof writer.write).toBe("function");
      expect(typeof writer.close).toBe("function");
    });

    test("writer accepts ArrayBuffer chunks", async () => {
      const writer = await adapter.createAudioFile("session-1");
      const chunk = new ArrayBuffer(100);

      await expect(writer.write(chunk)).resolves.toBeUndefined();
    });

    test("writer close completes without error", async () => {
      const writer = await adapter.createAudioFile("session-1");

      await expect(writer.close()).resolves.toBeUndefined();
    });
  });

  describe("getAudioFile", () => {
    test("returns null when no file exists", async () => {
      const file = await adapter.getAudioFile("non-existent");

      expect(file).toBeNull();
    });

    test("returns File after writing and closing", async () => {
      const writer = await adapter.createAudioFile("session-1");
      const chunk1 = new Uint8Array([1, 2, 3]).buffer;
      const chunk2 = new Uint8Array([4, 5, 6]).buffer;

      await writer.write(chunk1);
      await writer.write(chunk2);
      await writer.close();

      const file = await adapter.getAudioFile("session-1");

      expect(file).not.toBeNull();
      expect(file!.name).toBe("session-1.webm");
      expect(file!.type).toBe("audio/webm");
      expect(file!.size).toBe(6);
    });
  });

  describe("deleteAudioFile", () => {
    test("deletes an existing file", async () => {
      const writer = await adapter.createAudioFile("session-1");
      await writer.write(new ArrayBuffer(10));
      await writer.close();

      await adapter.deleteAudioFile("session-1");

      const file = await adapter.getAudioFile("session-1");
      expect(file).toBeNull();
    });

    test("no-op when file does not exist", async () => {
      await expect(adapter.deleteAudioFile("non-existent")).resolves.toBeUndefined();
    });
  });

  describe("listSessions", () => {
    test("returns empty array initially", async () => {
      const sessions = await adapter.listSessions();

      expect(sessions).toEqual([]);
    });

    test("returns session ids after writing", async () => {
      const writer1 = await adapter.createAudioFile("session-1");
      await writer1.close();
      const writer2 = await adapter.createAudioFile("session-2");
      await writer2.close();

      const sessions = await adapter.listSessions();

      expect(sessions).toHaveLength(2);
      expect(sessions).toContain("session-1");
      expect(sessions).toContain("session-2");
    });

    test("excludes deleted sessions", async () => {
      const writer1 = await adapter.createAudioFile("session-1");
      await writer1.close();
      const writer2 = await adapter.createAudioFile("session-2");
      await writer2.close();

      await adapter.deleteAudioFile("session-1");

      const sessions = await adapter.listSessions();
      expect(sessions).toEqual(["session-2"]);
    });
  });
});
