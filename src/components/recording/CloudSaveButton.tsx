/**
 * Cloud save button — uploads locally recorded audio to the server.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/hooks/useAudioUpload.ts, src/hooks/useLocalRecording.ts
 */

import { Upload, Loader2, Check, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface CloudSaveButtonProps {
  sessionId: string | null;
  meetingId: string | null;
  isRecording: boolean;
  isUploading: boolean;
  progress: number;
  error: string | null;
  hasLocalRecording: boolean;
  onUpload: (sessionId: string, meetingId: string) => void;
  onCancel: () => void;
}

export function CloudSaveButton({
  sessionId,
  meetingId,
  isRecording,
  isUploading,
  progress,
  error,
  hasLocalRecording,
  onUpload,
  onCancel,
}: CloudSaveButtonProps) {
  const canUpload = !isRecording && !isUploading && hasLocalRecording && sessionId && meetingId;
  const isComplete = progress === 100 && !isUploading && !error;

  function handleClick() {
    if (isUploading) {
      onCancel();
    } else if (canUpload) {
      onUpload(sessionId!, meetingId!);
    }
  }

  if (!hasLocalRecording && !isUploading && !isComplete && !error) {
    return null;
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="size-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <Button
          onClick={handleClick}
          disabled={!canUpload && !isUploading}
          variant={isComplete ? "outline" : isUploading ? "secondary" : "default"}
          size="sm"
          className="gap-2"
        >
          {isUploading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Uploading... {progress}%
            </>
          ) : isComplete ? (
            <>
              <Check className="size-4" />
              Saved
            </>
          ) : (
            <>
              <Upload className="size-4" />
              Save to Cloud
            </>
          )}
        </Button>

        {isUploading && (
          <Button onClick={onCancel} variant="ghost" size="sm">
            <X className="size-4" />
          </Button>
        )}
      </div>

      {isUploading && (
        <div className="w-48 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
