/**
 * Recording control buttons (Start/Stop).
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useRecording.ts
 */

import { Circle, Square, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SessionStatus } from "@/types/messages";

interface RecordingControlsProps {
  sessionStatus: SessionStatus;
  isRecording: boolean;
  hasPermission: boolean;
  isLoading: boolean;
  error: string | null;
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
  onRequestPermission,
  onStart,
  onStop,
}: RecordingControlsProps) {
  return (
    <div className="flex items-center justify-center gap-4">
      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="size-4" />
          <span>{error}</span>
        </div>
      )}

      {!hasPermission ? (
        <Button onClick={onRequestPermission} disabled={isLoading} size="lg" className="gap-2">
          {isLoading ? <Loader2 className="size-4 animate-spin" /> : <Circle className="size-4" />}
          Grant Camera & Mic Access
        </Button>
      ) : isRecording ? (
        <Button onClick={onStop} variant="destructive" size="lg" className="gap-2">
          <Square className="size-4 fill-current" />
          Stop Recording
        </Button>
      ) : (
        <Button
          onClick={onStart}
          size="lg"
          className="gap-2"
          disabled={sessionStatus === "processing"}
        >
          {sessionStatus === "processing" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Circle className="size-4 fill-red-500 text-red-500" />
          )}
          Start Recording
        </Button>
      )}
    </div>
  );
}
