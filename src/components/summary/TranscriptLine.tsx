/**
 * Single utterance display with speaker label and timestamp.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/lib/transcript-utils.ts, src/components/summary/SummaryPanel.tsx
 */

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/transcript-utils";

interface TranscriptLineProps {
  text: string;
  speaker?: number;
  startTime?: number;
  speakerAliases?: Record<number, string>;
  onSpeakerLabelEdit?: (speaker: number, displayName: string) => void;
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
  speakerAliases = {},
  onSpeakerLabelEdit,
  isInterim = false,
  className,
}: TranscriptLineProps) {
  const hasSpeaker = speaker !== undefined;
  const hasTime = startTime !== undefined;
  const speakerColor = hasSpeaker ? getSpeakerColor(speaker) : "";
  const speakerAlias = hasSpeaker ? (speakerAliases[speaker] ?? "") : "";
  const displayName = hasSpeaker ? speakerAlias || `Speaker ${speaker + 1}` : "";
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [draftLabel, setDraftLabel] = useState(speakerAlias);

  useEffect(() => {
    if (!isEditingLabel) {
      setDraftLabel(speakerAlias);
    }
  }, [speaker, speakerAlias, isEditingLabel]);

  function commitSpeakerLabelEdit(): void {
    if (!hasSpeaker || !onSpeakerLabelEdit) {
      setIsEditingLabel(false);
      return;
    }
    onSpeakerLabelEdit(speaker, draftLabel.trim());
    setIsEditingLabel(false);
  }

  function cancelSpeakerLabelEdit(): void {
    setDraftLabel(speakerAlias);
    setIsEditingLabel(false);
  }

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
        <>
          {isEditingLabel && onSpeakerLabelEdit ? (
            <input
              value={draftLabel}
              onChange={(e) => setDraftLabel(e.target.value)}
              onBlur={commitSpeakerLabelEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitSpeakerLabelEdit();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelSpeakerLabelEdit();
                }
              }}
              className={cn(
                "flex-shrink-0 h-6 w-28 rounded border border-border bg-background px-1.5 text-xs font-medium",
                speakerColor,
              )}
              aria-label={`Edit speaker ${speaker + 1} label`}
              placeholder={`Speaker ${speaker + 1}`}
              autoFocus
            />
          ) : onSpeakerLabelEdit ? (
            <button
              type="button"
              onClick={() => setIsEditingLabel(true)}
              className={cn(
                "flex-shrink-0 font-medium text-xs text-left hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-ring rounded-sm",
                speakerColor,
              )}
              aria-label={`Edit speaker ${speaker + 1} label`}
            >
              {displayName}:
            </button>
          ) : (
            <span className={cn("flex-shrink-0 font-medium text-xs", speakerColor)}>
              {displayName}:
            </span>
          )}
        </>
      )}

      {/* Text content */}
      <span className={cn("flex-1", isInterim && "italic")}>{text}</span>
    </div>
  );
}
