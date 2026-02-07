/**
 * Recording control buttons (Start/Stop).
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useRecordingController.ts
 */

import { Circle, Square, AlertCircle, Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import type { SessionStatus, MediaSourceType } from "@/types/messages";
import { useTranslation } from "react-i18next";

interface RecordingControlsProps {
  sessionStatus: SessionStatus;
  isRecording: boolean;
  hasPermission: boolean;
  isLoading: boolean;
  error: string | null;
  sourceType?: MediaSourceType;
  /** Formatted elapsed time to display when recording (e.g., "02:45") */
  elapsedTime?: string;
  /** Whether a meeting is active (required to start recording) */
  hasMeeting?: boolean;
  /** Read-only meeting mode. */
  readOnly?: boolean;
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
  elapsedTime,
  hasMeeting = true,
  readOnly = false,
  onRequestPermission,
  onStart,
  onStop,
}: RecordingControlsProps) {
  const { t } = useTranslation();
  const permissionButtonText =
    sourceType === "camera" ? t("recording.grantCameraMic") : t("recording.shareScreenMic");

  const isPermissionDenied = error?.toLowerCase().includes("permission denied");

  let primaryControl: ReactNode;

  if (!hasPermission) {
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
