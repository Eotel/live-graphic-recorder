/**
 * Toggle between camera and screen capture sources.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useMediaStream.ts, src/components/recording/CameraPreview.tsx
 */

import { Camera, Monitor, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaSourceType } from "@/types/messages";

interface MediaSourceToggleProps {
  value: MediaSourceType;
  onChange: (type: MediaSourceType) => void;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
}

export function MediaSourceToggle({
  value,
  onChange,
  disabled = false,
  isLoading = false,
  className,
}: MediaSourceToggleProps) {
  const isDisabled = disabled || isLoading;

  return (
    <div
      className={cn("inline-flex rounded-lg bg-muted p-1", isDisabled && "opacity-50", className)}
    >
      <button
        type="button"
        onClick={() => onChange("camera")}
        disabled={isDisabled}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          value === "camera"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
          isDisabled && "cursor-not-allowed",
        )}
      >
        {isLoading && value !== "camera" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Camera className="size-4" />
        )}
        Camera
      </button>
      <button
        type="button"
        onClick={() => onChange("screen")}
        disabled={isDisabled}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          value === "screen"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
          isDisabled && "cursor-not-allowed",
        )}
      >
        {isLoading && value !== "screen" ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Monitor className="size-4" />
        )}
        Screen
      </button>
    </div>
  );
}
