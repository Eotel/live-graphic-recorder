import type { PaneState, PaneStateController } from "@/hooks/usePaneState";
import type { UsePopoutWindowReturn } from "@/hooks/usePopoutWindow";
import type { UseMediaStreamControllerReturn } from "@/hooks/useMediaStreamController";
import type { UseRecordingControllerReturn } from "@/hooks/useRecordingController";
import type { UseLocalRecordingReturn } from "@/hooks/useLocalRecording";
import type { UseAudioUploadReturn } from "@/hooks/useAudioUpload";
import type { UseAuthReturn } from "@/hooks/useAuth";
import type { UseMeetingSessionReturn } from "@/hooks/useMeetingSession";
import type { AppStoreSnapshot } from "@/app/view-model/app-store";
import type { PaneId } from "@/logic/pane-state-controller";

export interface AppShellAuthViewModel {
  status: UseAuthReturn["status"];
  isSubmitting: boolean;
  error: string | null;
  login: UseAuthReturn["login"];
  signup: UseAuthReturn["signup"];
}

export interface AppShellViewModel {
  auth: AppShellAuthViewModel;
  appState: AppStoreSnapshot;
  session: UseMeetingSessionReturn;
  media: UseMediaStreamControllerReturn;
  recording: UseRecordingControllerReturn;
  localRecording: UseLocalRecordingReturn;
  audioUpload: UseAudioUploadReturn;
  paneState: PaneStateController & PaneState;
  popouts: {
    summary: UsePopoutWindowReturn;
    camera: UsePopoutWindowReturn;
    graphics: UsePopoutWindowReturn;
  };
  elapsedTime: string;
  error: string | null;
  onPopout: (paneId: PaneId) => Promise<void>;
  onNewMeeting: (title?: string) => void;
  onSelectMeeting: (meetingId: string) => void;
  onRefreshMeetings: () => void;
  onResumeMeeting: () => void;
  onRequestPermission: () => Promise<void>;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onUpload: (meetingId: string) => void;
  onCancelUpload: () => void;
  onDownloadReport: () => Promise<void>;
  onDownloadAudio: () => void;
  onBackRequested: () => void;
  onLogout: () => Promise<void>;
}
