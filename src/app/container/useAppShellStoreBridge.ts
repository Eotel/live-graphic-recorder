import { useEffect } from "react";

import type { UseAuthReturn } from "@/hooks/useAuth";
import type { UseMeetingSessionReturn } from "@/hooks/useMeetingSession";
import type { UseMediaStreamControllerReturn } from "@/hooks/useMediaStreamController";
import type { UseRecordingControllerReturn } from "@/hooks/useRecordingController";
import type { UseAudioUploadReturn } from "@/hooks/useAudioUpload";
import type { PaneState, PaneStateController } from "@/hooks/usePaneState";
import type { AppStoreActions } from "@/app/view-model/app-store";

interface UseAppShellStoreBridgeParams {
  appActions: AppStoreActions;
  auth: UseAuthReturn;
  session: UseMeetingSessionReturn;
  media: UseMediaStreamControllerReturn;
  recording: UseRecordingControllerReturn;
  audioUpload: UseAudioUploadReturn;
  paneState: PaneStateController & PaneState;
  elapsedTime: string;
  localSessionId: string | null;
  localPendingCount: number;
}

export function useAppShellStoreBridge({
  appActions,
  auth,
  session,
  media,
  recording,
  audioUpload,
  paneState,
  elapsedTime,
  localSessionId,
  localPendingCount,
}: UseAppShellStoreBridgeParams) {
  useEffect(() => {
    appActions.setAuthState({
      status: auth.status,
      user: auth.user,
      error: auth.error,
      isSubmitting: auth.isSubmitting,
    });
  }, [appActions, auth.error, auth.isSubmitting, auth.status, auth.user]);

  useEffect(() => {
    appActions.setMeetingState({
      isConnected: session.isConnected,
      meetingId: session.meeting.meetingId,
      meetingTitle: session.meeting.meetingTitle,
      sessionId: session.meeting.sessionId,
      mode: session.meeting.mode,
      meetingList: session.meeting.meetingList,
    });
  }, [
    appActions,
    session.isConnected,
    session.meeting.meetingId,
    session.meeting.meetingList,
    session.meeting.mode,
    session.meeting.meetingTitle,
    session.meeting.sessionId,
  ]);

  useEffect(() => {
    appActions.setRecordingState({
      sessionStatus: session.sessionStatus,
      isRecording: recording.isRecording,
      elapsedTime,
      localSessionId,
      hasLocalFile: localPendingCount > 0,
      error: recording.error,
    });
  }, [
    appActions,
    elapsedTime,
    localPendingCount,
    localSessionId,
    recording.error,
    recording.isRecording,
    session.sessionStatus,
  ]);

  useEffect(() => {
    appActions.setMediaState({
      hasPermission: media.hasPermission,
      isLoading: media.isLoading,
      isSwitching: media.isSwitching,
      sourceType: media.sourceType,
      error: media.error,
    });
  }, [
    appActions,
    media.error,
    media.hasPermission,
    media.isLoading,
    media.isSwitching,
    media.sourceType,
  ]);

  useEffect(() => {
    appActions.setUploadState({
      isUploading: audioUpload.isUploading,
      progress: audioUpload.progress,
      error: audioUpload.error,
      lastUploadedSessionId: audioUpload.lastUploadedSessionId,
      lastUploadedAudioUrl: audioUpload.lastUploadedAudioUrl,
      uploadedCount: audioUpload.uploadedCount,
      totalCount: audioUpload.totalCount,
    });
  }, [
    appActions,
    audioUpload.error,
    audioUpload.isUploading,
    audioUpload.lastUploadedAudioUrl,
    audioUpload.lastUploadedSessionId,
    audioUpload.progress,
    audioUpload.totalCount,
    audioUpload.uploadedCount,
  ]);

  useEffect(() => {
    appActions.setUiState({
      expandedPane: paneState.expandedPane,
      popoutPanes: Array.from(paneState.popoutPanes),
    });
  }, [appActions, paneState.expandedPane, paneState.popoutPanes]);
}
