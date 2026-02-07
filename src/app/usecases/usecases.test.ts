import { describe, expect, mock, test } from "bun:test";
import { createMeetingUsecase } from "./createMeetingUsecase";
import { buildDefaultReportUrl, downloadReportUsecase } from "./downloadReportUsecase";
import { logoutUsecase } from "./logoutUsecase";
import { recordingLifecycleUsecase } from "./recordingLifecycleUsecase";
import { selectMeetingUsecase } from "./selectMeetingUsecase";

describe("createMeetingUsecase", () => {
  test("queues meeting action when disconnected", () => {
    const setPendingAction = mock((_action) => {});
    const connect = mock(() => {});
    const startMeeting = mock((_title?: string) => {});

    const run = createMeetingUsecase({
      isConnected: () => false,
      connect,
      startMeeting,
      setPendingAction,
    });

    const result = run("Kickoff");

    expect(result).toBe("queued");
    expect(setPendingAction).toHaveBeenCalledWith({ type: "new", title: "Kickoff" });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(startMeeting).not.toHaveBeenCalled();
  });

  test("starts meeting immediately when connected", () => {
    const startMeeting = mock((_title?: string) => {});
    const onStarted = mock(() => {});

    const run = createMeetingUsecase({
      isConnected: () => true,
      connect: mock(() => {}),
      startMeeting,
      onStarted,
    });

    const result = run("Kickoff");

    expect(result).toBe("started");
    expect(startMeeting).toHaveBeenCalledWith("Kickoff");
    expect(onStarted).toHaveBeenCalledTimes(1);
  });
});

describe("selectMeetingUsecase", () => {
  test("queues select action when disconnected", () => {
    const setPendingAction = mock((_action) => {});
    const connect = mock(() => {});
    const startMeeting = mock((_title: undefined, _meetingId: string) => {});

    const run = selectMeetingUsecase({
      isConnected: () => false,
      connect,
      startMeeting,
      setPendingAction,
    });

    const result = run("meeting-1");

    expect(result).toBe("queued");
    expect(setPendingAction).toHaveBeenCalledWith({ type: "select", meetingId: "meeting-1" });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(startMeeting).not.toHaveBeenCalled();
  });

  test("starts selected meeting when connected", () => {
    const startMeeting = mock((_title: undefined, _meetingId: string, _mode: "view") => {});

    const run = selectMeetingUsecase({
      isConnected: () => true,
      connect: mock(() => {}),
      startMeeting,
    });

    const result = run("meeting-1");

    expect(result).toBe("started");
    expect(startMeeting).toHaveBeenCalledWith(undefined, "meeting-1", "view");
  });
});

describe("recordingLifecycleUsecase", () => {
  test("start and stop orchestrate session/local recording", () => {
    const startSession = mock(() => {});
    const stopSession = mock(() => {});
    const startLocalRecording = mock((_sessionId: string) => {});
    const stopLocalRecording = mock(() => {});
    const onRecordingStopped = mock((_hasLocalFile: boolean) => {});

    const lifecycle = recordingLifecycleUsecase({
      startSession,
      stopSession,
      startLocalRecording,
      stopLocalRecording,
      getSessionId: () => "session-1",
      hasLocalAudioFile: () => true,
      onRecordingStopped,
    });

    lifecycle.start();
    const hasLocalFile = lifecycle.stop();

    expect(startSession).toHaveBeenCalledTimes(1);
    expect(startLocalRecording).toHaveBeenCalledWith("session-1");
    expect(stopSession).toHaveBeenCalledTimes(1);
    expect(stopLocalRecording).toHaveBeenCalledTimes(1);
    expect(hasLocalFile).toBe(true);
    expect(onRecordingStopped).toHaveBeenCalledWith(true);
  });
});

describe("logoutUsecase", () => {
  test("does not run twice while locked", async () => {
    let inProgress = false;
    const performLogout = mock(async () => {});

    const run = logoutUsecase({
      isLogoutInProgress: () => inProgress,
      setLogoutInProgress: (value) => {
        inProgress = value;
      },
      performLogout,
    });

    const first = await run();
    inProgress = true;
    const second = await run();

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(performLogout).toHaveBeenCalledTimes(1);
  });
});

describe("downloadReportUsecase", () => {
  test("builds default report URL", () => {
    expect(buildDefaultReportUrl("meeting-1")).toBe(
      "/api/meetings/meeting-1/report.zip?media=auto",
    );
  });

  test("applies lock lifecycle around download", async () => {
    let locked = false;
    let downloading = false;
    let unlockTimer: (() => void) | undefined;

    const triggerDownload = mock((_url: string) => {});

    const run = downloadReportUsecase({
      getMeetingId: () => "meeting-1",
      isLocked: () => locked,
      lock: () => {
        locked = true;
      },
      unlock: () => {
        locked = false;
      },
      setDownloading: (value) => {
        downloading = value;
      },
      clearUnlockTimer: () => {
        unlockTimer = undefined;
      },
      setUnlockTimer: (callback) => {
        unlockTimer = callback;
      },
      triggerDownload,
    });

    const ok = await run();

    expect(ok).toBe(true);
    expect(triggerDownload).toHaveBeenCalledWith("/api/meetings/meeting-1/report.zip?media=auto");
    expect(locked).toBe(true);
    expect(downloading).toBe(true);

    if (typeof unlockTimer === "function") {
      const invokeUnlockTimer: () => void = unlockTimer;
      invokeUnlockTimer();
    }

    expect(locked).toBe(false);
    expect(downloading).toBe(false);
  });
});
