export interface RecordingLifecycleDeps {
  startSession: () => void;
  stopSession: () => void;
  resetLocalRecording: () => void;
  startLocalRecording: (sessionId: string) => void;
  stopLocalRecording: () => void;
  getSessionId: () => string | null;
  hasLocalAudioFile: () => boolean;
  onRecordingStarted?: () => void;
  onRecordingStopped?: (hasLocalFile: boolean) => void;
}

export interface RecordingLifecycleUsecase {
  start: () => void;
  stop: () => boolean;
}

export function recordingLifecycleUsecase(deps: RecordingLifecycleDeps): RecordingLifecycleUsecase {
  return {
    start: () => {
      deps.startSession();
      deps.resetLocalRecording();
      const sessionId = deps.getSessionId();
      if (sessionId) {
        deps.startLocalRecording(sessionId);
      }
      deps.onRecordingStarted?.();
    },

    stop: () => {
      deps.stopSession();
      deps.stopLocalRecording();
      const hasLocalFile = deps.hasLocalAudioFile();
      deps.onRecordingStopped?.(hasLocalFile);
      return hasLocalFile;
    },
  };
}
