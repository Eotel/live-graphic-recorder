import { describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import { createMeetingWsUsecase } from "@/server/application/ws/meeting-usecase";
import type { RecordingLockManager } from "@/server/application/ws/recording-lock-manager";
import { createWsContext } from "@/server/presentation/ws/context";
import type { WSContext } from "@/server/types/context";
import type { PersistenceService } from "@/services/server/persistence";

const TEST_MEETING_ID = "550e8400-e29b-41d4-a716-446655440000";

function createSocket(userId: string): {
  ws: ServerWebSocket<WSContext>;
  sent: Array<{ type?: string; data?: unknown }>;
} {
  const sent: Array<{ type?: string; data?: unknown }> = [];
  const ws = {
    data: createWsContext(userId, "session-1"),
    send(payload: string) {
      sent.push(JSON.parse(payload) as { type?: string; data?: unknown });
    },
  } as unknown as ServerWebSocket<WSContext>;
  return { ws, sent };
}

function createRecordingLocks(): RecordingLockManager {
  return {
    isLockedByAnother: () => false,
    acquire: () => true,
    release: () => {},
  };
}

describe("createMeetingWsUsecase admin meeting visibility", () => {
  test("lists all meetings for admin users", () => {
    let capturedOwnerUserId: string | undefined = "uninitialized";
    const persistence = {
      getUserById: () => ({
        id: "admin-1",
        email: "admin@example.com",
        passwordHash: "hash",
        createdAt: 1,
        role: "admin",
      }),
      listMeetings: (_limit: number | undefined, ownerUserId?: string) => {
        capturedOwnerUserId = ownerUserId;
        return [
          {
            id: TEST_MEETING_ID,
            title: "Cross-user meeting",
            startedAt: 10,
            endedAt: 20,
            createdAt: 5,
            ownerUserId: "owner-1",
          },
        ];
      },
    } as unknown as PersistenceService;

    const usecase = createMeetingWsUsecase({
      persistence,
      recordingLocks: createRecordingLocks(),
    });
    const { ws, sent } = createSocket("admin-1");

    usecase.list(ws);

    expect(capturedOwnerUserId).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.type).toBe("meeting:list");
  });

  test("keeps owner scope for non-admin users", () => {
    let capturedOwnerUserId: string | undefined = "uninitialized";
    const persistence = {
      getUserById: () => ({
        id: "user-1",
        email: "user1@example.com",
        passwordHash: "hash",
        createdAt: 1,
        role: "user",
      }),
      listMeetings: (_limit: number | undefined, ownerUserId?: string) => {
        capturedOwnerUserId = ownerUserId;
        return [];
      },
    } as unknown as PersistenceService;

    const usecase = createMeetingWsUsecase({
      persistence,
      recordingLocks: createRecordingLocks(),
    });
    const { ws } = createSocket("user-1");

    usecase.list(ws);

    expect(capturedOwnerUserId).toBe("user-1");
  });

  test("allows admin to open an existing meeting owned by another user", () => {
    let capturedOwnerUserId: string | undefined = "uninitialized";
    const persistence = {
      getUserById: () => ({
        id: "admin-1",
        email: "admin@example.com",
        passwordHash: "hash",
        createdAt: 1,
        role: "admin",
      }),
      getMeeting: (_meetingId: string, ownerUserId?: string) => {
        capturedOwnerUserId = ownerUserId;
        return {
          id: TEST_MEETING_ID,
          title: "Owned by another",
          startedAt: 1,
          endedAt: 2,
          createdAt: 1,
          ownerUserId: "owner-1",
        };
      },
      createSession: () => ({
        id: "session-1",
        meetingId: TEST_MEETING_ID,
        status: "idle",
        startedAt: null,
        endedAt: null,
        createdAt: 1,
      }),
      loadMeetingTranscript: () => [],
      loadMeetingAnalyses: () => [],
      loadMeetingImages: () => [],
      loadMeetingCaptures: () => [],
      loadMetaSummaries: () => [],
      loadSpeakerAliases: () => [],
    } as unknown as PersistenceService;

    const usecase = createMeetingWsUsecase({
      persistence,
      recordingLocks: createRecordingLocks(),
    });
    const { ws, sent } = createSocket("admin-1");

    usecase.start(ws, ws.data, {
      meetingId: TEST_MEETING_ID,
      mode: "view",
    });

    expect(capturedOwnerUserId).toBeUndefined();
    expect(sent[0]?.type).toBe("meeting:status");
    expect(sent[1]?.type).toBe("meeting:history");
  });
});
