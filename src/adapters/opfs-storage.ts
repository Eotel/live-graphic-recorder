/**
 * OPFS (Origin Private File System) storage adapter for local audio recording.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/logic/local-recording-controller.ts, src/adapters/types.ts
 */

export interface OPFSAudioWriter {
  write(chunk: ArrayBuffer): Promise<void>;
  close(): Promise<void>;
}

export interface OPFSStorageAdapter {
  createAudioFile(sessionId: string): Promise<OPFSAudioWriter>;
  getAudioFile(sessionId: string): Promise<File | null>;
  deleteAudioFile(sessionId: string): Promise<void>;
  listSessions(): Promise<string[]>;
}

const AUDIO_DIR_NAME = "audio";

/**
 * Create an OPFS storage adapter that uses the browser's Origin Private File System.
 */
export function createOPFSStorageAdapter(): OPFSStorageAdapter {
  async function getAudioDir(): Promise<FileSystemDirectoryHandle> {
    const root = await navigator.storage.getDirectory();
    return root.getDirectoryHandle(AUDIO_DIR_NAME, { create: true });
  }

  return {
    async createAudioFile(sessionId: string): Promise<OPFSAudioWriter> {
      const dir = await getAudioDir();
      const fileHandle = await dir.getFileHandle(`${sessionId}.webm`, { create: true });
      const writable = await fileHandle.createWritable();

      return {
        async write(chunk: ArrayBuffer): Promise<void> {
          await writable.write(chunk);
        },
        async close(): Promise<void> {
          await writable.close();
        },
      };
    },

    async getAudioFile(sessionId: string): Promise<File | null> {
      try {
        const dir = await getAudioDir();
        const fileHandle = await dir.getFileHandle(`${sessionId}.webm`);
        const file = await fileHandle.getFile();
        if (file.size === 0) return null;
        return new File([file], `${sessionId}.webm`, { type: "audio/webm" });
      } catch {
        return null;
      }
    },

    async deleteAudioFile(sessionId: string): Promise<void> {
      try {
        const dir = await getAudioDir();
        await dir.removeEntry(`${sessionId}.webm`);
      } catch {
        // File doesn't exist — no-op
      }
    },

    async listSessions(): Promise<string[]> {
      const dir = await getAudioDir();
      const sessions: string[] = [];
      for await (const [name] of dir as unknown as AsyncIterable<[string, FileSystemHandle]>) {
        if (name.endsWith(".webm")) {
          sessions.push(name.replace(/\.webm$/, ""));
        }
      }
      return sessions;
    },
  };
}

/**
 * Create a mock OPFS storage adapter for testing.
 */
export function createMockOPFSStorageAdapter(): OPFSStorageAdapter {
  const store = new Map<string, Uint8Array[]>();
  const closed = new Set<string>();

  return {
    async createAudioFile(sessionId: string): Promise<OPFSAudioWriter> {
      const chunks: Uint8Array[] = [];
      store.set(sessionId, chunks);
      closed.delete(sessionId);

      return {
        async write(chunk: ArrayBuffer): Promise<void> {
          chunks.push(new Uint8Array(chunk));
        },
        async close(): Promise<void> {
          closed.add(sessionId);
        },
      };
    },

    async getAudioFile(sessionId: string): Promise<File | null> {
      const chunks = store.get(sessionId);
      if (!chunks || !closed.has(sessionId)) return null;
      const totalSize = chunks.reduce((sum, c) => sum + c.length, 0);
      if (totalSize === 0) return null;
      const merged = new Uint8Array(totalSize);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      return new File([merged], `${sessionId}.webm`, { type: "audio/webm" });
    },

    async deleteAudioFile(sessionId: string): Promise<void> {
      store.delete(sessionId);
      closed.delete(sessionId);
    },

    async listSessions(): Promise<string[]> {
      return Array.from(closed);
    },
  };
}
