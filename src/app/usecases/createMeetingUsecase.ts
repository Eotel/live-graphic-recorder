export interface PendingMeetingAction {
  type: "new" | "select";
  title?: string;
  meetingId?: string;
}

export interface CreateMeetingUsecaseDeps {
  isConnected: () => boolean;
  connect: () => void;
  startMeeting: (title?: string) => void;
  beforeStart?: () => void;
  onStarted?: () => void;
  setPendingAction?: (action: PendingMeetingAction | null) => void;
}

export type CreateMeetingUsecaseResult = "started" | "queued";

export function createMeetingUsecase(
  deps: CreateMeetingUsecaseDeps,
): (title?: string) => CreateMeetingUsecaseResult {
  return (title?: string) => {
    if (!deps.isConnected()) {
      deps.setPendingAction?.({ type: "new", title });
      deps.connect();
      return "queued";
    }

    deps.beforeStart?.();
    deps.startMeeting(title);
    deps.onStarted?.();
    return "started";
  };
}
