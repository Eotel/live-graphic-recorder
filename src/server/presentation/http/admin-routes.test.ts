import { describe, expect, test } from "bun:test";
import type { AuthService } from "@/server/application/auth";
import { createAdminRoutes } from "@/server/presentation/http/admin-routes";
import type { PersistenceService } from "@/services/server/persistence";

interface CreateAdminRouteInput {
  authResult: ReturnType<AuthService["requireAuthenticatedUser"]>;
  userRole: "user" | "staff" | "admin" | null;
  listAdminSessions?: PersistenceService["listAdminSessions"];
  getAdminSessionDetail?: PersistenceService["getAdminSessionDetail"];
}

function createRoutes(input: CreateAdminRouteInput): {
  listRoute: { GET: (req: Request) => Promise<Response> };
  detailRoute: (req: Request) => Promise<Response>;
} {
  const auth = {
    requireAuthenticatedUser: () => input.authResult,
    unauthorizedResponse: () => new Response("Unauthorized", { status: 401 }),
  } as unknown as AuthService;

  const persistence = {
    getUserById: () =>
      input.userRole
        ? {
            id: "user-1",
            email: "user1@example.com",
            passwordHash: "hash",
            createdAt: 1,
            role: input.userRole,
          }
        : null,
    listAdminSessions:
      input.listAdminSessions ??
      (() => ({
        items: [],
        total: 0,
        limit: 50,
        offset: 0,
      })),
    getAdminSessionDetail: input.getAdminSessionDetail ?? (() => null),
  } as unknown as PersistenceService;

  const routes = createAdminRoutes({ auth, persistence });
  return {
    listRoute: routes["/api/admin/sessions"] as { GET: (req: Request) => Promise<Response> },
    detailRoute: routes["/api/admin/sessions/:sessionId"] as (req: Request) => Promise<Response>,
  };
}

describe("createAdminRoutes", () => {
  test("returns 401 when unauthenticated", async () => {
    const { listRoute } = createRoutes({
      authResult: new Response("Unauthorized", { status: 401 }),
      userRole: null,
    });

    const response = await listRoute.GET(new Request("http://localhost/api/admin/sessions"));
    expect(response.status).toBe(401);
  });

  test("returns 403 for regular user", async () => {
    const { listRoute } = createRoutes({
      authResult: { userId: "user-1" },
      userRole: "user",
    });

    const response = await listRoute.GET(new Request("http://localhost/api/admin/sessions"));
    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Admin permission required");
  });

  test("returns session list for staff/admin", async () => {
    const { listRoute } = createRoutes({
      authResult: { userId: "user-2" },
      userRole: "staff",
      listAdminSessions: () => ({
        items: [
          {
            sessionId: "session-1",
            meetingId: "meeting-1",
            meetingTitle: "Design Review",
            ownerUserId: "owner-1",
            ownerEmail: "owner@example.com",
            status: "idle",
            startedAt: 100,
            endedAt: 200,
            meetingCreatedAt: 50,
          },
        ],
        total: 1,
        limit: 50,
        offset: 0,
      }),
    });

    const response = await listRoute.GET(new Request("http://localhost/api/admin/sessions"));
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      sessions: Array<{ sessionId: string }>;
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.sessions[0]?.sessionId).toBe("session-1");
  });

  test("returns 400 when session id is invalid", async () => {
    const { detailRoute } = createRoutes({
      authResult: { userId: "user-2" },
      userRole: "admin",
    });

    const response = await detailRoute(new Request("http://localhost/api/admin/sessions/../bad"));
    expect(response.status).toBe(400);
    expect(await response.text()).toBe("Bad Request");
  });

  test("returns 404 when session detail is not found", async () => {
    const { detailRoute } = createRoutes({
      authResult: { userId: "user-2" },
      userRole: "admin",
      getAdminSessionDetail: () => null,
    });

    const response = await detailRoute(
      new Request("http://localhost/api/admin/sessions/session-2"),
    );
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Session not found");
  });

  test("returns session detail for admin", async () => {
    const { detailRoute } = createRoutes({
      authResult: { userId: "user-2" },
      userRole: "admin",
      getAdminSessionDetail: () => ({
        sessionId: "session-2",
        meetingId: "meeting-2",
        meetingTitle: "Retro",
        ownerUserId: "owner-2",
        ownerEmail: "owner2@example.com",
        status: "recording",
        startedAt: 100,
        endedAt: null,
        meetingCreatedAt: 90,
        counts: {
          transcriptSegments: 20,
          analyses: 4,
          images: 2,
          captures: 10,
          audioRecordings: 1,
        },
      }),
    });

    const response = await detailRoute(
      new Request("http://localhost/api/admin/sessions/session-2"),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { session: { sessionId: string } };
    expect(body.session.sessionId).toBe("session-2");
  });
});
