/**
 * Single utterance display with speaker label and timestamp.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/lib/transcript-utils.ts, src/components/summary/SummaryPanel.tsx
 */

import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/transcript-utils";

interface TranscriptLineProps {
  text: string;
  speaker?: number;
  startTime?: number;
  isInterim?: boolean;
  className?: string;
}

// 8 distinct colors for speaker differentiation, rotating for speakers > 8
const SPEAKER_COLORS = [
  "text-blue-600 dark:text-blue-400",
  "text-green-600 dark:text-green-400",
  "text-purple-600 dark:text-purple-400",
  "text-orange-600 dark:text-orange-400",
  "text-pink-600 dark:text-pink-400",
  "text-cyan-600 dark:text-cyan-400",
  "text-yellow-600 dark:text-yellow-400",
  "text-red-600 dark:text-red-400",
] as const;

const DEFAULT_SPEAKER_COLOR = SPEAKER_COLORS[0];

function getSpeakerColor(speaker: number): string {
  const index = speaker % SPEAKER_COLORS.length;
  return SPEAKER_COLORS[index] ?? DEFAULT_SPEAKER_COLOR;
}

export function TranscriptLine({
  text,
  speaker,
  startTime,
  isInterim = false,
  className,
}: TranscriptLineProps) {
  const hasSpeaker = speaker !== undefined;
  const hasTime = startTime !== undefined;
  const speakerColor = hasSpeaker ? getSpeakerColor(speaker) : "";

  return (
    <div
      className={cn(
        "flex items-start gap-2 text-sm leading-relaxed",
        isInterim && "text-muted-foreground/50",
        className,
      )}
    >
      {/* Timestamp */}
      {hasTime && (
        <span className="flex-shrink-0 text-xs text-muted-foreground font-mono w-10">
          {formatTime(startTime)}
        </span>
      )}

      {/* Speaker label */}
      {hasSpeaker && (
        <span className={cn("flex-shrink-0 font-medium text-xs", speakerColor)}>
          Speaker {speaker + 1}:
        </span>
      )}

      {/* Text content */}
      <span className={cn("flex-1", isInterim && "italic")}>{text}</span>
    </div>
  );
}
