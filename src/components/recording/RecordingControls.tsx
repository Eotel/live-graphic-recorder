/**
 * Recording control buttons (Start/Stop).
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useRecording.ts
 */

import { Circle, Square, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionStatus, MediaSourceType } from "@/types/messages";

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
  onRequestPermission,
  onStart,
  onStop,
}: RecordingControlsProps) {
  const permissionButtonText =
    sourceType === "camera" ? "Grant Camera & Mic Access" : "Share Screen & Mic";

  const isPermissionDenied = error?.toLowerCase().includes("permission denied");

  return (
    <div className="flex flex-col items-center justify-center gap-4">
      {error && (
        <div className="flex flex-col items-center gap-2 text-destructive text-sm max-w-md text-center">
          <div className="flex items-center gap-2">
            <AlertCircle className="size-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          {isPermissionDenied && (
            <span className="text-xs text-muted-foreground">
              Check your browser settings to enable camera/microphone access for this site.
            </span>
          )}
        </div>
      )}

      {!hasPermission ? (
        <Button onClick={onRequestPermission} disabled={isLoading} size="lg" className="gap-2">
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Circle className="size-4" />}
          {permissionButtonText}
        </Button>
      ) : isRecording ? (
        <>
          <Button onClick={onStop} variant="destructive" size="lg" className="gap-2">
            <Square className="size-4 fill-current" />
            Stop Recording
          </Button>
          {elapsedTime && (
            <span className="font-mono tabular-nums text-sm text-muted-foreground">
              {elapsedTime}
            </span>
          )}
        </>
      ) : (
        <Button
          onClick={onStart}
          size="lg"
          className="gap-2"
          disabled={sessionStatus === "processing" || isLoading || !hasMeeting}
          title={!hasMeeting ? "Start or join a meeting first" : undefined}
        >
          {sessionStatus === "processing" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Circle className="size-4 fill-red-500 text-red-500" />
          )}
          {hasMeeting ? "Start Recording" : "Select Meeting First"}
        </Button>
      )}
    </div>
  );
}
