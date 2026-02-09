import { useEffect } from "react";

import type { UseAuthReturn } from "@/hooks/useAuth";
import type { UseMeetingSessionReturn } from "@/hooks/useMeetingSession";
import type { UseMediaStreamControllerReturn } from "@/hooks/useMediaStreamController";
import type { UseRecordingControllerReturn } from "@/hooks/useRecordingController";
import type { UseAudioUploadReturn } from "@/hooks/useAudioUpload";
import type { PaneState, PaneStateController } from "@/hooks/usePaneState";
import type { AppStore, AppStoreActions } from "@/app/view-model/app-store";

interface UseAppShellStoreBridgeParams {
  appStore: AppStore;
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

function buildMediaDevicesSignature(devices: MediaDeviceInfo[]): string {
  return devices
    .map((device) => `${device.kind}:${device.deviceId}:${device.groupId}:${device.label}`)
    .join("|");
}

function buildStringArraySignature(values: string[]): string {
  return values.join("\u0000");
}

function buildSummaryPagesSignature(
  summaryPages: Array<{ points: string[]; timestamp: number }>,
): string {
  return summaryPages
    .map((page) => `${page.timestamp}:${page.points.join("\u0001")}`)
    .join("\u0002");
}

function buildTranscriptSegmentsSignature(
  segments: Array<{
    text: string;
    timestamp: number;
    isFinal: boolean;
    speaker?: number;
    startTime?: number;
    isUtteranceEnd?: boolean;
  }>,
): string {
  return segments
    .map((segment) =>
      [
        segment.timestamp,
        segment.text,
        segment.isFinal ? "1" : "0",
        segment.speaker ?? "",
        segment.startTime ?? "",
        segment.isUtteranceEnd ? "1" : "0",
      ].join(":"),
    )
    .join("\u0002");
}

function buildImagesSignature(
  images: Array<{ base64?: string; url?: string; prompt: string; timestamp: number }>,
): string {
  return images
    .map(
      (image) =>
        `${image.timestamp}:${image.prompt}:${image.url ?? ""}:${image.base64?.length ?? 0}`,
    )
    .join("\u0002");
}

export function useAppShellStoreBridge({
  appStore,
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
  const mediaAudioDevicesSignature = buildMediaDevicesSignature(media.audioDevices);
  const mediaVideoDevicesSignature = buildMediaDevicesSignature(media.videoDevices);
  const sessionSummaryPagesSignature = buildSummaryPagesSignature(session.summaryPages);
  const sessionTranscriptSignature = buildTranscriptSegmentsSignature(session.transcriptSegments);
  const sessionTopicsSignature = buildStringArraySignature(session.topics);
  const sessionTagsSignature = buildStringArraySignature(session.tags);
  const sessionImagesSignature = buildImagesSignature(session.images);

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
    const nextMedia = {
      hasPermission: media.hasPermission,
      isLoading: media.isLoading,
      isSwitching: media.isSwitching,
      sourceType: media.sourceType,
      audioDevices: media.audioDevices,
      videoDevices: media.videoDevices,
      selectedAudioDeviceId: media.selectedAudioDeviceId,
      selectedVideoDeviceId: media.selectedVideoDeviceId,
      error: media.error,
    };
    const currentMedia = appStore.getState().media;
    if (
      currentMedia.hasPermission === nextMedia.hasPermission &&
      currentMedia.isLoading === nextMedia.isLoading &&
      currentMedia.isSwitching === nextMedia.isSwitching &&
      currentMedia.sourceType === nextMedia.sourceType &&
      currentMedia.selectedAudioDeviceId === nextMedia.selectedAudioDeviceId &&
      currentMedia.selectedVideoDeviceId === nextMedia.selectedVideoDeviceId &&
      currentMedia.error === nextMedia.error &&
      buildMediaDevicesSignature(currentMedia.audioDevices) === mediaAudioDevicesSignature &&
      buildMediaDevicesSignature(currentMedia.videoDevices) === mediaVideoDevicesSignature
    ) {
      return;
    }
    appActions.setMediaState(nextMedia);
  }, [
    appStore,
    appActions,
    media.error,
    media.hasPermission,
    media.isLoading,
    media.isSwitching,
    mediaAudioDevicesSignature,
    media.selectedAudioDeviceId,
    media.selectedVideoDeviceId,
    media.sourceType,
    mediaVideoDevicesSignature,
  ]);

  useEffect(() => {
    const nextSession = {
      summaryPages: session.summaryPages,
      transcriptSegments: session.transcriptSegments,
      interimText: session.interimText,
      interimSpeaker: session.interimSpeaker,
      interimStartTime: session.interimStartTime,
      isAnalyzing: session.isAnalyzing,
      sttStatus: session.sttStatus,
      topics: session.topics,
      tags: session.tags,
      flow: session.flow,
      heat: session.heat,
      images: session.images,
      generationPhase: session.generationPhase,
      isGenerating: session.isGenerating,
      imageModel: session.imageModel,
    };
    const currentSession = appStore.getState().session;
    if (
      currentSession.interimText === nextSession.interimText &&
      currentSession.interimSpeaker === nextSession.interimSpeaker &&
      currentSession.interimStartTime === nextSession.interimStartTime &&
      currentSession.isAnalyzing === nextSession.isAnalyzing &&
      currentSession.sttStatus?.state === nextSession.sttStatus?.state &&
      currentSession.sttStatus?.retryAttempt === nextSession.sttStatus?.retryAttempt &&
      currentSession.sttStatus?.message === nextSession.sttStatus?.message &&
      currentSession.flow === nextSession.flow &&
      currentSession.heat === nextSession.heat &&
      currentSession.generationPhase === nextSession.generationPhase &&
      currentSession.isGenerating === nextSession.isGenerating &&
      currentSession.imageModel.preset === nextSession.imageModel.preset &&
      currentSession.imageModel.model === nextSession.imageModel.model &&
      currentSession.imageModel.available.flash === nextSession.imageModel.available.flash &&
      currentSession.imageModel.available.pro === nextSession.imageModel.available.pro &&
      buildSummaryPagesSignature(currentSession.summaryPages) === sessionSummaryPagesSignature &&
      buildTranscriptSegmentsSignature(currentSession.transcriptSegments) ===
        sessionTranscriptSignature &&
      buildStringArraySignature(currentSession.topics) === sessionTopicsSignature &&
      buildStringArraySignature(currentSession.tags) === sessionTagsSignature &&
      buildImagesSignature(currentSession.images) === sessionImagesSignature
    ) {
      return;
    }
    appActions.setSessionState(nextSession);
  }, [
    appStore,
    appActions,
    session.flow,
    session.generationPhase,
    session.heat,
    session.imageModel.available.flash,
    session.imageModel.available.pro,
    session.imageModel.model,
    session.imageModel.preset,
    session.interimSpeaker,
    session.interimStartTime,
    session.interimText,
    session.isAnalyzing,
    session.isGenerating,
    session.sttStatus?.message,
    session.sttStatus?.retryAttempt,
    session.sttStatus?.state,
    sessionImagesSignature,
    sessionSummaryPagesSignature,
    sessionTagsSignature,
    sessionTopicsSignature,
    sessionTranscriptSignature,
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
