/**
 * Audio level indicator component with pulse animation.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useAudioLevel.ts, src/components/recording/DeviceSelector.tsx
 */

import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AudioLevelIndicatorProps {
  /** Whether audio is currently active (above threshold) */
  isActive: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Displays a microphone icon with a pulse ring animation when audio is active.
 * Respects prefers-reduced-motion via CSS.
 */
export function AudioLevelIndicator({ isActive, className }: AudioLevelIndicatorProps) {
  return (
    <div className={cn("relative inline-flex items-center justify-center", className)}>
      {/* Pulse ring - only shown when active */}
      {isActive && (
        <span
          data-testid="pulse-ring"
          className="absolute inset-0 rounded-full bg-green-500/30"
          style={{
            animation: "pulse-ring 1.5s ease-out infinite",
          }}
        />
      )}
      {/* Mic icon */}
      <Mic
        data-testid="mic-icon"
        className={cn(
          "h-4 w-4 flex-shrink-0 relative z-10",
          isActive ? "text-green-500" : "text-muted-foreground",
        )}
      />
    </div>
  );
}
