import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const triggerAnchorDownloadMock = mock((_url: string) => {});
mock.module("@/app/bridge", () => ({
  triggerAnchorDownload: triggerAnchorDownloadMock,
}));

import { i18n } from "@/i18n/config";
import { AdminPage } from "./AdminPage";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function pathFromInput(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  if (input instanceof URL) {
    return input.pathname;
  }
  return input.url;
}

function mockAdminApiFetch(meetingId: string, sessionId: string): typeof fetch {
  return mock(async (input: RequestInfo | URL): Promise<Response> => {
    const path = pathFromInput(input);
    if (path.startsWith("/api/admin/sessions?")) {
      return jsonResponse({
        sessions: [
          {
            sessionId,
            meetingId,
            meetingTitle: "Design Review",
            ownerUserId: "owner-1",
            ownerEmail: "owner@example.com",
            status: "idle",
            startedAt: 100,
            endedAt: 200,
            meetingCreatedAt: 90,
          },
        ],
        total: 1,
        limit: 30,
        offset: 0,
      });
    }

    if (path === `/api/admin/sessions/${sessionId}`) {
      return jsonResponse({
        session: {
          sessionId,
          meetingId,
          meetingTitle: "Design Review",
          ownerUserId: "owner-1",
          ownerEmail: "owner@example.com",
          status: "idle",
          startedAt: 100,
          endedAt: 200,
          meetingCreatedAt: 90,
          counts: {
            transcriptSegments: 1,
            analyses: 1,
            images: 1,
            captures: 1,
            audioRecordings: 1,
          },
        },
      });
    }

    return new Response("Not found", { status: 404 });
  }) as unknown as typeof fetch;
}

describe("AdminPage report download", () => {
  let originalFetch: typeof fetch;

  beforeEach(async () => {
    originalFetch = globalThis.fetch;
    triggerAnchorDownloadMock.mockClear();
    await i18n.changeLanguage("en");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    cleanup();
  });

  test("allows admin to download report for selected session meeting", async () => {
    const meetingId = "550e8400-e29b-41d4-a716-446655440000";
    const sessionId = "session-1";
    globalThis.fetch = mockAdminApiFetch(meetingId, sessionId);

    render(
      <AdminPage
        userEmail="admin@example.com"
        userRole="admin"
        isSubmitting={false}
        onBackToApp={mock(() => {})}
        onLogout={mock(async () => {})}
      />,
    );

    const downloadButton = await waitFor(() =>
      screen.getByRole("button", { name: /download report/i }),
    );

    fireEvent.click(downloadButton);

    expect(triggerAnchorDownloadMock).toHaveBeenCalledTimes(1);
    expect(triggerAnchorDownloadMock).toHaveBeenCalledWith(
      `/api/meetings/${meetingId}/report.zip?media=auto`,
    );
  });

  test("does not show report download button for staff", async () => {
    const meetingId = "550e8400-e29b-41d4-a716-446655440000";
    const sessionId = "session-1";
    globalThis.fetch = mockAdminApiFetch(meetingId, sessionId);

    render(
      <AdminPage
        userEmail="staff@example.com"
        userRole="staff"
        isSubmitting={false}
        onBackToApp={mock(() => {})}
        onLogout={mock(async () => {})}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(meetingId)).toBeDefined();
    });

    expect(screen.queryByRole("button", { name: /download report/i })).toBeNull();
    expect(triggerAnchorDownloadMock).toHaveBeenCalledTimes(0);
  });
});
