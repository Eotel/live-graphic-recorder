/**
 * Toggle between camera and screen capture sources.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useMediaStream.ts, src/components/recording/CameraPreview.tsx
 */

import { Camera, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaSourceType } from "@/types/messages";

interface MediaSourceToggleProps {
  value: MediaSourceType;
  onChange: (type: MediaSourceType) => void;
  disabled?: boolean;
  className?: string;
}

export function MediaSourceToggle({
  value,
  onChange,
  disabled = false,
  className,
}: MediaSourceToggleProps) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg bg-muted p-1",
        disabled && "opacity-50",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onChange("camera")}
        disabled={disabled}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          value === "camera"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
          disabled && "cursor-not-allowed",
        )}
      >
        <Camera className="size-4" />
        Camera
      </button>
      <button
        type="button"
        onClick={() => onChange("screen")}
        disabled={disabled}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
          value === "screen"
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
          disabled && "cursor-not-allowed",
        )}
      >
        <Monitor className="size-4" />
        Screen
      </button>
    </div>
  );
}
