/**
 * Recording control buttons (Start/Stop).
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useRecordingController.ts
 */

import { Circle, Square, AlertCircle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { SessionStatus, MediaSourceType, SttConnectionState } from "@/types/messages";
import { useTranslation } from "react-i18next";

interface RecordingControlsProps {
  sessionStatus: SessionStatus;
  isRecording: boolean;
  hasPermission: boolean;
  isLoading: boolean;
  error: string | null;
  sourceType?: MediaSourceType;
  sttStatus?: {
    state: SttConnectionState;
    retryAttempt?: number;
    message?: string;
  } | null;
  /** Formatted elapsed time to display when recording (e.g., "02:45") */
  elapsedTime?: string;
  /** Whether a meeting is active (required to start recording) */
  hasMeeting?: boolean;
  /** Read-only meeting mode. */
  readOnly?: boolean;
  /** Resume read-only meeting and switch to record mode. */
  onResumeMeeting?: () => void;
  onRequestPermission: () => void;
  onStart: () => void;
  onStop: () => void;
}

export function RecordingControls({
  sessionStatus,
  isRecording,
  hasPermission,
  isLoading,
  error,
  sourceType = "camera",
  sttStatus = null,
  elapsedTime,
  hasMeeting = true,
  readOnly = false,
  onResumeMeeting,
  onRequestPermission,
  onStart,
  onStop,
}: RecordingControlsProps) {
  const { t } = useTranslation();
  const permissionButtonText =
    sourceType === "camera" ? t("recording.grantCameraMic") : t("recording.shareScreenMic");

  const isPermissionDenied = error?.toLowerCase().includes("permission denied");
  const showSttWarning = isRecording && sttStatus && sttStatus.state !== "connected";
  const sttMessage = showSttWarning
    ? (sttStatus.message ??
      (sttStatus.state === "reconnecting"
        ? t("recording.sttReconnecting", { attempt: sttStatus.retryAttempt ?? 1 })
        : sttStatus.state === "degraded"
          ? t("recording.sttDegraded")
          : t("recording.sttFailed")))
    : null;

  let primaryControl: ReactNode;

  if (readOnly) {
    primaryControl = (
      <Button onClick={onResumeMeeting} size="lg" className="gap-2" disabled={!hasMeeting}>
        <Circle className="size-4" />
        {t("meeting.resumeMeeting")}
      </Button>
    );
  } else if (!hasPermission) {
    primaryControl = (
      <Button
        onClick={onRequestPermission}
        disabled={isLoading || readOnly}
        size="lg"
        className="gap-2"
      >
        {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Circle className="size-4" />}
        {permissionButtonText}
      </Button>
    );
  } else if (isRecording) {
    primaryControl = (
      <Button onClick={onStop} variant="destructive" size="lg" className="gap-2">
        <Square className="size-4 fill-current" />
        {t("recording.stopRecording")}
      </Button>
    );
  } else {
    primaryControl = (
      <Button
        onClick={onStart}
        size="lg"
        className="gap-2"
        disabled={sessionStatus === "processing" || isLoading || !hasMeeting || readOnly}
        title={!hasMeeting ? t("recording.startOrJoinMeetingFirst") : undefined}
      >
        {sessionStatus === "processing" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Circle className="size-4 fill-red-500 text-red-500" />
        )}
        {!hasMeeting
          ? t("recording.selectMeetingFirst")
          : readOnly
            ? t("recording.readOnly")
            : t("recording.startRecording")}
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2">
      {error && (
        <div className="flex flex-col items-center gap-2 text-destructive text-sm max-w-md text-center">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          {isPermissionDenied && (
            <span className="text-xs text-muted-foreground">
              {t("recording.permissionDeniedHelp")}
            </span>
          )}
        </div>
      )}

      {sttMessage && (
        <div className="flex items-center gap-2 text-amber-600 text-sm max-w-md text-center">
          <AlertCircle className="size-4 flex-shrink-0" />
          <span>{sttMessage}</span>
        </div>
      )}

      <div className="flex items-center justify-center gap-3" data-testid="recording-control-row">
        {primaryControl}
        {isRecording && elapsedTime && (
          <span className="font-mono tabular-nums text-sm text-muted-foreground">
            {elapsedTime}
          </span>
        )}
      </div>
    </div>
  );
}
