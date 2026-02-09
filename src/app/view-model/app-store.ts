import { hasUnsavedRecording } from "@/logic/unsaved-recording";
import type { PaneId } from "@/logic/pane-state-controller";
import type {
  GenerationPhase,
  ImageModelPreset,
  MediaSourceType,
  MeetingInfo,
  SessionStatus,
  MeetingMode,
  SummaryPage,
  SttConnectionState,
  TranscriptSegment,
} from "@/types/messages";
import type { UserRole } from "@/types/auth";
import { createStore, type StoreApi } from "zustand/vanilla";

export type AppView = "select" | "recording";
export type PaneMode = "normal" | "expanded" | "popout";

export interface AppStoreDependencies {
  initialize?: () => Promise<void> | void;
  createMeeting?: (title?: string) => Promise<void> | void;
  selectMeeting?: (meetingId: string) => Promise<void> | void;
  startRecording?: () => Promise<void> | void;
  stopRecording?: () => Promise<void> | void;
  logout?: () => Promise<void> | void;
  downloadReport?: (meetingId: string) => Promise<void> | void;
  refreshMeetings?: () => Promise<MeetingInfo[] | void> | MeetingInfo[] | void;
  togglePaneMode?: (paneId: PaneId, mode: PaneMode) => Promise<void> | void;
  updateMeetingTitle?: (title: string) => Promise<void> | void;
  setImageModelPreset?: (preset: ImageModelPreset) => Promise<void> | void;
  setAudioDevice?: (deviceId: string) => Promise<void> | void;
  setVideoDevice?: (deviceId: string) => Promise<void> | void;
  switchSourceType?: (type: MediaSourceType) => Promise<void> | void;
  switchVideoSource?: (type: MediaSourceType) => Promise<boolean> | boolean;
  onDownloadReportError?: (error: unknown) => void;
  reportUnlockDelayMs?: number;
}

export interface AppStoreState {
  auth: {
    status: "loading" | "authenticated" | "unauthenticated";
    user: { id: string; email: string; role: UserRole } | null;
    error: string | null;
    isSubmitting: boolean;
    isLogoutInProgress: boolean;
  };
  meeting: {
    view: AppView;
    isConnected: boolean;
    meetingId: string | null;
    meetingTitle: string | null;
    sessionId: string | null;
    mode: MeetingMode | null;
    meetingList: MeetingInfo[];
    isListLoading: boolean;
    listError: string | null;
    pendingAction: { type: "new" | "select"; title?: string; meetingId?: string } | null;
  };
  recording: {
    sessionStatus: SessionStatus;
    isRecording: boolean;
    elapsedTime: string;
    localSessionId: string | null;
    hasLocalFile: boolean;
    error: string | null;
  };
  media: {
    hasPermission: boolean;
    isLoading: boolean;
    isSwitching: boolean;
    sourceType: MediaSourceType;
    audioDevices: MediaDeviceInfo[];
    videoDevices: MediaDeviceInfo[];
    selectedAudioDeviceId: string | null;
    selectedVideoDeviceId: string | null;
    error: string | null;
  };
  session: {
    summaryPages: SummaryPage[];
    transcriptSegments: TranscriptSegment[];
    interimText: string;
    interimSpeaker: number | undefined;
    interimStartTime: number | undefined;
    isAnalyzing: boolean;
    sttStatus: {
      state: SttConnectionState;
      retryAttempt?: number;
      message?: string;
    } | null;
    topics: string[];
    tags: string[];
    flow: number;
    heat: number;
    images: Array<{
      base64?: string;
      url?: string;
      prompt: string;
      timestamp: number;
    }>;
    generationPhase: GenerationPhase;
    isGenerating: boolean;
    imageModel: {
      preset: ImageModelPreset;
      model: string;
      available: {
        flash: string;
        pro?: string;
      };
    };
  };
  upload: {
    isUploading: boolean;
    progress: number;
    error: string | null;
    lastUploadedSessionId: string | null;
    lastUploadedAudioUrl: string | null;
    uploadedCount: number;
    totalCount: number;
  };
  ui: {
    expandedPane: PaneId | null;
    popoutPanes: PaneId[];
    reportDownloadLocked: boolean;
    isDownloadingReport: boolean;
    reportDownloadError: string | null;
    reportDownloadUnlockTimer: ReturnType<typeof setTimeout> | null;
  };
  derived: {
    hasMeeting: boolean;
    hasUnsavedRecording: boolean;
    canStartRecording: boolean;
    canStopRecording: boolean;
    canDownloadReport: boolean;
    hasUploadTarget: boolean;
  };
}

export interface AppStoreActions {
  initialize: (snapshot?: AppStoreSnapshotPatch) => Promise<void>;
  setAuthState: (auth: Partial<AppStoreState["auth"]>) => void;
  setMeetingState: (meeting: Partial<AppStoreState["meeting"]>) => void;
  setRecordingState: (recording: Partial<AppStoreState["recording"]>) => void;
  setMediaState: (media: Partial<AppStoreState["media"]>) => void;
  setSessionState: (session: Partial<AppStoreState["session"]>) => void;
  setUploadState: (upload: Partial<AppStoreState["upload"]>) => void;
  setUiState: (ui: Partial<AppStoreState["ui"]>) => void;
  selectMeeting: (meetingId: string) => Promise<void>;
  createMeeting: (title?: string) => Promise<void>;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  logout: () => Promise<void>;
  downloadReport: () => Promise<boolean>;
  refreshMeetings: () => Promise<void>;
  togglePaneMode: (paneId: PaneId, mode: PaneMode) => Promise<void>;
  updateMeetingTitle: (title: string) => Promise<void>;
  setImageModelPreset: (preset: ImageModelPreset) => Promise<void>;
  setAudioDevice: (deviceId: string) => Promise<void>;
  setVideoDevice: (deviceId: string) => Promise<void>;
  changeMediaSource: (type: MediaSourceType) => void;
}

export type AppStoreSnapshot = AppStoreState & {
  actions: AppStoreActions;
};

export type AppStore = StoreApi<AppStoreSnapshot>;

export interface AppStoreSnapshotPatch {
  auth?: Partial<AppStoreState["auth"]>;
  meeting?: Partial<AppStoreState["meeting"]>;
  recording?: Partial<AppStoreState["recording"]>;
  media?: Partial<AppStoreState["media"]>;
  session?: Partial<AppStoreState["session"]>;
  upload?: Partial<AppStoreState["upload"]>;
  ui?: Partial<AppStoreState["ui"]>;
}

const DEFAULT_REPORT_UNLOCK_MS = 2000;

function createDefaultState(): Omit<AppStoreSnapshot, "actions"> {
  const base: Omit<AppStoreSnapshot, "actions"> = {
    auth: {
      status: "loading",
      user: null,
      error: null,
      isSubmitting: false,
      isLogoutInProgress: false,
    },
    meeting: {
      view: "select",
      isConnected: false,
      meetingId: null,
      meetingTitle: null,
      sessionId: null,
      mode: null,
      meetingList: [],
      isListLoading: false,
      listError: null,
      pendingAction: null,
    },
    recording: {
      sessionStatus: "idle",
      isRecording: false,
      elapsedTime: "00:00",
      localSessionId: null,
      hasLocalFile: false,
      error: null,
    },
    media: {
      hasPermission: false,
      isLoading: false,
      isSwitching: false,
      sourceType: "camera",
      audioDevices: [],
      videoDevices: [],
      selectedAudioDeviceId: null,
      selectedVideoDeviceId: null,
      error: null,
    },
    session: {
      summaryPages: [],
      transcriptSegments: [],
      interimText: "",
      interimSpeaker: undefined,
      interimStartTime: undefined,
      isAnalyzing: false,
      sttStatus: null,
      topics: [],
      tags: [],
      flow: 50,
      heat: 50,
      images: [],
      generationPhase: "idle",
      isGenerating: false,
      imageModel: {
        preset: "flash",
        model: "",
        available: {
          flash: "",
        },
      },
    },
    upload: {
      isUploading: false,
      progress: 0,
      error: null,
      lastUploadedSessionId: null,
      lastUploadedAudioUrl: null,
      uploadedCount: 0,
      totalCount: 0,
    },
    ui: {
      expandedPane: null,
      popoutPanes: [],
      reportDownloadLocked: false,
      isDownloadingReport: false,
      reportDownloadError: null,
      reportDownloadUnlockTimer: null,
    },
    derived: {
      hasMeeting: false,
      hasUnsavedRecording: false,
      canStartRecording: false,
      canStopRecording: false,
      canDownloadReport: false,
      hasUploadTarget: false,
    },
  };

  return {
    ...base,
    derived: computeDerived(base),
  };
}

function computeDerived(state: Omit<AppStoreSnapshot, "actions">): AppStoreState["derived"] {
  const hasMeeting = Boolean(state.meeting.meetingId);
  const hasUploadTarget = Boolean(state.recording.hasLocalFile && state.meeting.meetingId);

  return {
    hasMeeting,
    hasUnsavedRecording: hasUnsavedRecording(
      state.recording.isRecording,
      state.recording.hasLocalFile,
    ),
    canStartRecording:
      state.media.hasPermission &&
      state.meeting.isConnected &&
      hasMeeting &&
      state.meeting.mode === "record" &&
      !state.recording.isRecording,
    canStopRecording: state.recording.isRecording,
    canDownloadReport: hasMeeting && !state.ui.isDownloadingReport,
    hasUploadTarget,
  };
}

function applyPatch(
  current: Omit<AppStoreSnapshot, "actions">,
  patch: AppStoreSnapshotPatch,
): Omit<AppStoreSnapshot, "actions"> {
  const next: Omit<AppStoreSnapshot, "actions"> = {
    auth: patch.auth ? { ...current.auth, ...patch.auth } : current.auth,
    meeting: patch.meeting ? { ...current.meeting, ...patch.meeting } : current.meeting,
    recording: patch.recording ? { ...current.recording, ...patch.recording } : current.recording,
    media: patch.media ? { ...current.media, ...patch.media } : current.media,
    session: patch.session
      ? {
          ...current.session,
          ...patch.session,
          imageModel: patch.session.imageModel
            ? {
                ...current.session.imageModel,
                ...patch.session.imageModel,
                available: patch.session.imageModel.available
                  ? {
                      ...current.session.imageModel.available,
                      ...patch.session.imageModel.available,
                    }
                  : current.session.imageModel.available,
              }
            : current.session.imageModel,
        }
      : current.session,
    upload: patch.upload ? { ...current.upload, ...patch.upload } : current.upload,
    ui: patch.ui
      ? {
          ...current.ui,
          ...patch.ui,
          popoutPanes: patch.ui.popoutPanes ? [...patch.ui.popoutPanes] : current.ui.popoutPanes,
        }
      : current.ui,
    derived: current.derived,
  };

  return {
    ...next,
    derived: computeDerived(next),
  };
}

export function createAppStore(
  deps: AppStoreDependencies = {},
  initialSnapshot: AppStoreSnapshotPatch = {},
): AppStore {
  return createStore<AppStoreSnapshot>((set, get) => {
    const defaults = createDefaultState();
    const initialState = applyPatch(defaults, initialSnapshot);

    const actions: AppStoreActions = {
      initialize: async (snapshot = {}) => {
        set((state) => ({ ...applyPatch(state, snapshot), actions: state.actions }));
        await deps.initialize?.();
      },

      setAuthState: (auth) => {
        set((state) => ({
          ...applyPatch(state, {
            auth,
          }),
          actions: state.actions,
        }));
      },

      setMeetingState: (meeting) => {
        set((state) => ({
          ...applyPatch(state, {
            meeting,
          }),
          actions: state.actions,
        }));
      },

      setRecordingState: (recording) => {
        set((state) => ({
          ...applyPatch(state, {
            recording,
          }),
          actions: state.actions,
        }));
      },

      setMediaState: (media) => {
        set((state) => ({
          ...applyPatch(state, {
            media,
          }),
          actions: state.actions,
        }));
      },

      setSessionState: (session) => {
        set((state) => ({
          ...applyPatch(state, {
            session,
          }),
          actions: state.actions,
        }));
      },

      setUploadState: (upload) => {
        set((state) => ({
          ...applyPatch(state, {
            upload,
          }),
          actions: state.actions,
        }));
      },

      setUiState: (ui) => {
        set((state) => ({
          ...applyPatch(state, {
            ui,
          }),
          actions: state.actions,
        }));
      },

      createMeeting: async (title) => {
        await deps.createMeeting?.(title);
        set(
          (state) =>
            ({
              ...applyPatch(state, {
                meeting: {
                  pendingAction: null,
                  view: "recording",
                  mode: "record",
                  listError: null,
                },
                recording: {
                  hasLocalFile: false,
                  localSessionId: null,
                },
              }),
              actions: state.actions,
            }) satisfies AppStoreSnapshot,
        );
      },

      selectMeeting: async (meetingId) => {
        await deps.selectMeeting?.(meetingId);
        set(
          (state) =>
            ({
              ...applyPatch(state, {
                meeting: {
                  pendingAction: null,
                  view: "recording",
                  mode: "view",
                  listError: null,
                },
                recording: {
                  hasLocalFile: false,
                  localSessionId: null,
                },
              }),
              actions: state.actions,
            }) satisfies AppStoreSnapshot,
        );
      },

      startRecording: async () => {
        await deps.startRecording?.();
        set(
          (state) =>
            ({
              ...applyPatch(state, {
                recording: {
                  isRecording: true,
                  sessionStatus: "recording",
                  error: null,
                },
              }),
              actions: state.actions,
            }) satisfies AppStoreSnapshot,
        );
      },

      stopRecording: async () => {
        await deps.stopRecording?.();
        set(
          (state) =>
            ({
              ...applyPatch(state, {
                recording: {
                  isRecording: false,
                  sessionStatus: "processing",
                },
              }),
              actions: state.actions,
            }) satisfies AppStoreSnapshot,
        );
      },

      logout: async () => {
        if (get().auth.isLogoutInProgress) {
          return;
        }

        const unlockTimer = get().ui.reportDownloadUnlockTimer;
        if (unlockTimer !== null) {
          clearTimeout(unlockTimer);
        }

        set(
          (state) =>
            ({
              ...applyPatch(state, {
                auth: { isLogoutInProgress: true },
              }),
              actions: state.actions,
            }) satisfies AppStoreSnapshot,
        );

        await deps.logout?.();

        const reset = createDefaultState();
        set(() => ({
          ...reset,
          auth: {
            ...reset.auth,
            status: "unauthenticated",
          },
          actions,
        }));
      },

      downloadReport: async () => {
        const { meetingId } = get().meeting;
        if (!meetingId || get().ui.reportDownloadLocked) {
          return false;
        }

        set(
          (state) =>
            ({
              ...applyPatch(state, {
                ui: {
                  reportDownloadLocked: true,
                  isDownloadingReport: true,
                  reportDownloadError: null,
                },
              }),
              actions: state.actions,
            }) satisfies AppStoreSnapshot,
        );

        try {
          await deps.downloadReport?.(meetingId);
        } catch (error) {
          deps.onDownloadReportError?.(error);
          set(
            (state) =>
              ({
                ...applyPatch(state, {
                  ui: {
                    reportDownloadLocked: false,
                    isDownloadingReport: false,
                    reportDownloadError: error instanceof Error ? error.message : String(error),
                  },
                }),
                actions: state.actions,
              }) satisfies AppStoreSnapshot,
          );
          return false;
        }

        const currentTimer = get().ui.reportDownloadUnlockTimer;
        if (currentTimer !== null) {
          clearTimeout(currentTimer);
        }

        const timer = setTimeout(() => {
          set((state) => ({
            ...applyPatch(state, {
              ui: {
                reportDownloadLocked: false,
                isDownloadingReport: false,
                reportDownloadUnlockTimer: null,
              },
            }),
            actions: state.actions,
          }));
        }, deps.reportUnlockDelayMs ?? DEFAULT_REPORT_UNLOCK_MS);

        set((state) => ({
          ...applyPatch(state, {
            ui: {
              reportDownloadUnlockTimer: timer,
            },
          }),
          actions: state.actions,
        }));

        return true;
      },

      refreshMeetings: async () => {
        set(
          (state) =>
            ({
              ...applyPatch(state, {
                meeting: {
                  isListLoading: true,
                  listError: null,
                },
              }),
              actions: state.actions,
            }) satisfies AppStoreSnapshot,
        );

        try {
          const meetings = await deps.refreshMeetings?.();
          set(
            (state) =>
              ({
                ...applyPatch(state, {
                  meeting: {
                    isListLoading: false,
                    meetingList: meetings ?? state.meeting.meetingList,
                  },
                }),
                actions: state.actions,
              }) satisfies AppStoreSnapshot,
          );
        } catch (error) {
          set(
            (state) =>
              ({
                ...applyPatch(state, {
                  meeting: {
                    isListLoading: false,
                    listError: error instanceof Error ? error.message : String(error),
                  },
                }),
                actions: state.actions,
              }) satisfies AppStoreSnapshot,
          );
        }
      },

      togglePaneMode: async (paneId, mode) => {
        const state = get();
        const popoutPanes = new Set(state.ui.popoutPanes);

        let expandedPane: PaneId | null = state.ui.expandedPane;

        if (mode === "popout") {
          popoutPanes.add(paneId);
          if (expandedPane === paneId) {
            expandedPane = null;
          }
        } else {
          popoutPanes.delete(paneId);
          expandedPane =
            mode === "expanded" ? paneId : expandedPane === paneId ? null : expandedPane;
        }

        set((current) => ({
          ...applyPatch(current, {
            ui: {
              expandedPane,
              popoutPanes: Array.from(popoutPanes),
            },
          }),
          actions: current.actions,
        }));

        await deps.togglePaneMode?.(paneId, mode);
      },

      updateMeetingTitle: async (title) => {
        await deps.updateMeetingTitle?.(title);
      },

      setImageModelPreset: async (preset) => {
        await deps.setImageModelPreset?.(preset);
      },

      setAudioDevice: async (deviceId) => {
        await deps.setAudioDevice?.(deviceId);
      },

      setVideoDevice: async (deviceId) => {
        await deps.setVideoDevice?.(deviceId);
      },

      changeMediaSource: (type) => {
        if (get().recording.isRecording) {
          void deps.switchVideoSource?.(type);
          return;
        }
        void deps.switchSourceType?.(type);
      },
    };

    return {
      ...initialState,
      actions,
    };
  });
}
