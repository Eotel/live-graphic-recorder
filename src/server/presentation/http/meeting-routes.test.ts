import { describe, expect, test } from "bun:test";
import type { AuthService } from "@/server/application/auth";
import { createMeetingRoutes } from "@/server/presentation/http/meeting-routes";
import type { PersistenceService } from "@/services/server/persistence";

interface CreateRouteDepsInput {
  authResult: ReturnType<AuthService["requireAuthenticatedUser"]>;
  getMeeting: PersistenceService["getMeeting"];
  listAudioRecordingsByMeeting: PersistenceService["listAudioRecordingsByMeeting"];
  getUserById?: PersistenceService["getUserById"];
}

function createAudioRoute(deps: CreateRouteDepsInput): {
  GET: (req: Request) => Promise<Response>;
} {
  const auth = {
    requireAuthenticatedUser: () => deps.authResult,
  } as unknown as AuthService;

  const persistence = {
    getUserById:
      deps.getUserById ??
      (() => ({
        id: "user-1",
        email: "user1@example.com",
        passwordHash: "hash",
        createdAt: 1,
        role: "user",
      })),
    getMeeting: deps.getMeeting,
    listAudioRecordingsByMeeting: deps.listAudioRecordingsByMeeting,
  } as unknown as PersistenceService;

  const routes = createMeetingRoutes({
    persistence,
    auth,
    mediaBasePath: "/tmp/test-media",
  });

  return routes["/api/meetings/:meetingId/audio"] as {
    GET: (req: Request) => Promise<Response>;
  };
}

describe("createMeetingRoutes GET /api/meetings/:meetingId/audio", () => {
  const meetingId = "550e8400-e29b-41d4-a716-446655440000";

  test("returns 401 when unauthenticated", async () => {
    const audioRoute = createAudioRoute({
      authResult: new Response("Unauthorized", { status: 401 }),
      getMeeting: () => null,
      listAudioRecordingsByMeeting: () => [],
    });

    const res = await audioRoute.GET(
      new Request(`http://localhost/api/meetings/${meetingId}/audio`),
    );

    expect(res.status).toBe(401);
  });

  test("returns 400 when meeting id is invalid", async () => {
    const audioRoute = createAudioRoute({
      authResult: { userId: "user-1" },
      getMeeting: () => null,
      listAudioRecordingsByMeeting: () => [],
    });

    const res = await audioRoute.GET(new Request("http://localhost/api/meetings/invalid-id/audio"));

    expect(res.status).toBe(400);
    expect(await res.text()).toBe("Invalid meeting ID");
  });

  test("returns 404 when meeting is not owned/found", async () => {
    const audioRoute = createAudioRoute({
      authResult: { userId: "user-1" },
      getMeeting: () => null,
      listAudioRecordingsByMeeting: () => [],
    });

    const res = await audioRoute.GET(
      new Request(`http://localhost/api/meetings/${meetingId}/audio`),
    );

    expect(res.status).toBe(404);
    expect(await res.text()).toBe("Meeting not found");
  });

  test("returns meeting audio recordings", async () => {
    const audioRoute = createAudioRoute({
      authResult: { userId: "user-1" },
      getMeeting: () => ({
        id: meetingId,
        title: "Test Meeting",
        startedAt: 1,
        endedAt: null,
        createdAt: 1,
        ownerUserId: "user-1",
      }),
      listAudioRecordingsByMeeting: () => [
        {
          id: 11,
          sessionId: "session-b",
          meetingId,
          filePath: "/tmp/test-media/audio/session-b/11.webm",
          fileSizeBytes: 2048,
          createdAt: 2_000,
        },
        {
          id: 10,
          sessionId: "session-a",
          meetingId,
          filePath: "/tmp/test-media/audio/session-a/10.webm",
          fileSizeBytes: 1024,
          createdAt: 1_000,
        },
      ],
    });

    const res = await audioRoute.GET(
      new Request(`http://localhost/api/meetings/${meetingId}/audio`),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      recordings: Array<{
        id: number;
        sessionId: string;
        fileSizeBytes: number;
        createdAt: number;
        url: string;
      }>;
    };

    expect(body.recordings).toHaveLength(2);
    expect(body.recordings[0]).toEqual({
      id: 11,
      sessionId: "session-b",
      fileSizeBytes: 2048,
      createdAt: 2_000,
      url: `/api/meetings/${meetingId}/audio/11`,
    });
    expect(body.recordings[1]).toEqual({
      id: 10,
      sessionId: "session-a",
      fileSizeBytes: 1024,
      createdAt: 1_000,
      url: `/api/meetings/${meetingId}/audio/10`,
    });
  });

  test("allows admin to read audio list for other user's meeting", async () => {
    let capturedOwnerUserIdForMeeting: string | undefined = "uninitialized";
    let capturedOwnerUserIdForAudioList: string | undefined = "uninitialized";
    const audioRoute = createAudioRoute({
      authResult: { userId: "admin-1" },
      getUserById: () => ({
        id: "admin-1",
        email: "admin@example.com",
        passwordHash: "hash",
        createdAt: 1,
        role: "admin",
      }),
      getMeeting: (_meetingId, ownerUserId) => {
        capturedOwnerUserIdForMeeting = ownerUserId;
        return {
          id: meetingId,
          title: "Other Owner Meeting",
          startedAt: 1,
          endedAt: 2,
          createdAt: 1,
          ownerUserId: "owner-1",
        };
      },
      listAudioRecordingsByMeeting: (_meetingId, ownerUserId) => {
        capturedOwnerUserIdForAudioList = ownerUserId;
        return [];
      },
    });

    const res = await audioRoute.GET(
      new Request(`http://localhost/api/meetings/${meetingId}/audio`),
    );

    expect(res.status).toBe(200);
    expect(capturedOwnerUserIdForMeeting).toBeUndefined();
    expect(capturedOwnerUserIdForAudioList).toBeUndefined();
  });
});
