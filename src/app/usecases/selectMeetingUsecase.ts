import type { PendingMeetingAction } from "./createMeetingUsecase";

export interface SelectMeetingUsecaseDeps {
  isConnected: () => boolean;
  connect: () => void;
  startMeeting: (title: undefined, meetingId: string, mode: "view") => void;
  beforeStart?: () => void;
  onStarted?: () => void;
  setPendingAction?: (action: PendingMeetingAction | null) => void;
}

export type SelectMeetingUsecaseResult = "started" | "queued";

export function selectMeetingUsecase(
  deps: SelectMeetingUsecaseDeps,
): (meetingId: string) => SelectMeetingUsecaseResult {
  return (meetingId: string) => {
    if (!deps.isConnected()) {
      deps.setPendingAction?.({ type: "select", meetingId });
      deps.connect();
      return "queued";
    }

    deps.beforeStart?.();
    deps.startMeeting(undefined, meetingId, "view");
    deps.onStarted?.();
    return "started";
  };
}
