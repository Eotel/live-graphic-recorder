/**
 * Camera/Screen preview video element.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useMediaStreamController.ts
 */

import { VideoOff, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaSourceType } from "@/types/messages";

interface CameraPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  hasPermission: boolean;
  isRecording: boolean;
  sourceType?: MediaSourceType;
  className?: string;
}

export function CameraPreview({
  videoRef,
  hasPermission,
  isRecording,
  sourceType = "camera",
  className,
}: CameraPreviewProps) {
  const Icon = sourceType === "camera" ? VideoOff : Monitor;
  const placeholderText = sourceType === "camera" ? "Camera not available" : "Screen not shared";

  return (
    <div className={cn("relative h-full bg-muted rounded-lg overflow-hidden", className)}>
      {hasPermission ? (
        <>
          <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
          {isRecording && (
            <div className="absolute top-3 right-3 flex items-center gap-2 bg-red-500 text-white text-xs font-medium px-2 py-1 rounded-full">
              <span className="size-2 rounded-full bg-white animate-pulse" />
              REC
            </div>
          )}
        </>
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
          <Icon className="size-12 mb-2" />
          <p className="text-sm">{placeholderText}</p>
        </div>
      )}
    </div>
  );
}
