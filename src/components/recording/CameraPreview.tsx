/**
 * Camera preview video element.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useMediaStream.ts
 */

import { VideoOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface CameraPreviewProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  hasPermission: boolean;
  isRecording: boolean;
  className?: string;
}

export function CameraPreview({
  videoRef,
  hasPermission,
  isRecording,
  className,
}: CameraPreviewProps) {
  return (
    <div className={cn("relative aspect-video bg-muted rounded-lg overflow-hidden", className)}>
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
          <VideoOff className="size-12 mb-2" />
          <p className="text-sm">Camera not available</p>
        </div>
      )}
    </div>
  );
}
