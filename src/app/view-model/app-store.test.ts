import { describe, expect, mock, test } from "bun:test";
import type { MeetingInfo } from "@/types/messages";
import { createAppStore } from "./app-store";

describe("createAppStore", () => {
  test("createMeeting updates view and invokes dependency", async () => {
    const createMeeting = mock(async (_title?: string) => {});
    const store = createAppStore(
      { createMeeting },
      {
        meeting: {
          isConnected: true,
          view: "select",
        },
        recording: {
          hasLocalFile: true,
          localSessionId: "session-1",
        },
      },
    );

    await store.getState().actions.createMeeting("Design Review");

    const state = store.getState();
    expect(createMeeting).toHaveBeenCalledWith("Design Review");
    expect(state.meeting.view).toBe("recording");
    expect(state.recording.hasLocalFile).toBe(false);
    expect(state.recording.localSessionId).toBeNull();
  });

  test("refreshMeetings stores returned meetings", async () => {
    const meetings: MeetingInfo[] = [
      {
        id: "meeting-1",
        title: "Weekly",
        startedAt: 1,
        endedAt: null,
        createdAt: 1,
      },
    ];
    const refreshMeetings = mock(async () => meetings);
    const store = createAppStore({ refreshMeetings });

    await store.getState().actions.refreshMeetings();

    const state = store.getState();
    expect(refreshMeetings).toHaveBeenCalledTimes(1);
    expect(state.meeting.meetingList).toEqual(meetings);
    expect(state.meeting.isListLoading).toBe(false);
  });

  test("start/stop recording updates derived flags", async () => {
    const store = createAppStore(
      {},
      {
        meeting: { isConnected: true, meetingId: "meeting-1" },
        media: { hasPermission: true },
      },
    );

    expect(store.getState().derived.canStartRecording).toBe(true);

    await store.getState().actions.startRecording();
    expect(store.getState().recording.isRecording).toBe(true);
    expect(store.getState().derived.canStopRecording).toBe(true);
    expect(store.getState().derived.canStartRecording).toBe(false);

    await store.getState().actions.stopRecording();
    expect(store.getState().recording.isRecording).toBe(false);
    expect(store.getState().derived.canStopRecording).toBe(false);
  });

  test("togglePaneMode updates expanded/popout state", async () => {
    const store = createAppStore();

    await store.getState().actions.togglePaneMode("summary", "popout");
    expect(store.getState().ui.popoutPanes).toContain("summary");
    expect(store.getState().ui.expandedPane).toBeNull();

    await store.getState().actions.togglePaneMode("summary", "expanded");
    expect(store.getState().ui.popoutPanes).not.toContain("summary");
    expect(store.getState().ui.expandedPane).toBe("summary");
  });

  test("section actions update store", () => {
    const store = createAppStore();
    const { actions } = store.getState();

    actions.setAuthState({
      status: "authenticated",
      user: { id: "u1", email: "user@example.com" },
    });
    actions.setMeetingState({ meetingId: "meeting-1", view: "recording" });
    actions.setMediaState({ hasPermission: true, isLoading: false });
    actions.setRecordingState({
      isRecording: false,
      sessionStatus: "idle",
      localSessionId: "session-1",
      hasLocalFile: true,
    });
    actions.setUploadState({ isUploading: true, progress: 40 });
    actions.setUiState({ expandedPane: "summary", popoutPanes: ["camera"] });

    const state = store.getState();
    expect(state.auth.status).toBe("authenticated");
    expect(state.meeting.meetingId).toBe("meeting-1");
    expect(state.upload.isUploading).toBe(true);
    expect(state.ui.expandedPane).toBe("summary");
    expect(state.ui.popoutPanes).toEqual(["camera"]);
    expect(state.derived.hasMeeting).toBe(true);
    expect(state.derived.hasUnsavedRecording).toBe(true);
  });

  test("downloadReport sets and clears lock", async () => {
    const downloadReport = mock(async (_meetingId: string) => {});
    const store = createAppStore(
      {
        downloadReport,
        reportUnlockDelayMs: 1,
      },
      {
        meeting: {
          meetingId: "meeting-1",
        },
      },
    );

    const ok = await store.getState().actions.downloadReport();

    expect(ok).toBe(true);
    expect(downloadReport).toHaveBeenCalledWith("meeting-1");
    expect(store.getState().ui.isDownloadingReport).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(store.getState().ui.isDownloadingReport).toBe(false);
    expect(store.getState().ui.reportDownloadLocked).toBe(false);
  });

  test("downloadReport notifies callback on dependency error", async () => {
    const onDownloadReportError = mock((_error: unknown) => {});
    const store = createAppStore(
      {
        downloadReport: async () => {
          throw new Error("download failed");
        },
        onDownloadReportError,
      },
      {
        meeting: {
          meetingId: "meeting-1",
        },
      },
    );

    const ok = await store.getState().actions.downloadReport();

    expect(ok).toBe(false);
    expect(onDownloadReportError).toHaveBeenCalledTimes(1);
    expect(store.getState().ui.reportDownloadLocked).toBe(false);
    expect(store.getState().ui.isDownloadingReport).toBe(false);
    expect(store.getState().ui.reportDownloadError).toContain("download failed");
  });
});
