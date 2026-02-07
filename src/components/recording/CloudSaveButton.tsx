/**
 * Cloud save button — uploads locally recorded audio to the server.
 *
 * Design doc: plans/audio-recording-plan.md
 * Related: src/hooks/useAudioUpload.ts, src/hooks/useLocalRecording.ts
 */

import { Upload, Loader2, X, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export interface CloudSaveButtonProps {
  meetingId: string | null;
  isRecording: boolean;
  isUploading: boolean;
  progress: number;
  error: string | null;
  pendingCount: number;
  onUpload: (meetingId: string) => void;
  onCancel: () => void;
}

export function CloudSaveButton({
  meetingId,
  isRecording,
  isUploading,
  progress,
  error,
  pendingCount,
  onUpload,
  onCancel,
}: CloudSaveButtonProps) {
  const { t } = useTranslation();
  const canUpload = !isRecording && !isUploading && pendingCount > 0 && meetingId;

  function handleClick() {
    if (isUploading) {
      onCancel();
    } else if (canUpload) {
      onUpload(meetingId!);
    }
  }

  if (pendingCount <= 0 && !isUploading && !error) {
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
          variant={isUploading ? "secondary" : "default"}
          size="sm"
          className="gap-2"
        >
          {isUploading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              {t("recording.uploadingWithProgress", { progress })}
            </>
          ) : (
            <>
              <Upload className="size-4" />
              {pendingCount > 1
                ? `${t("recording.saveToCloud")} (${pendingCount})`
                : t("recording.saveToCloud")}
            </>
          )}
        </Button>

        {isUploading && (
          <Button
            onClick={onCancel}
            variant="ghost"
            size="sm"
            aria-label={t("recording.cancelUpload")}
          >
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
