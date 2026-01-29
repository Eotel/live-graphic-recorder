/**
 * Utility functions for transcript processing.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/types/messages.ts, src/components/summary/SummaryPanel.tsx
 */

import type { TranscriptSegment } from "@/types/messages";

/**
 * Represents a grouped utterance from one speaker.
 */
export interface UtteranceGroup {
  text: string;
  speaker?: number;
  startTime?: number;
  isInterim: boolean;
}

/**
 * Formats seconds into a human-readable time string (M:SS format).
 *
 * @param seconds - Time in seconds (can be fractional)
 * @returns Formatted time string like "1:23" or "10:05"
 */
export function formatTime(seconds: number): string {
  if (seconds < 0) {
    return "0:00";
  }

  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;

  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Groups transcript segments by utterance boundaries.
 *
 * Utterances are split when:
 * 1. A segment has isUtteranceEnd: true
 * 2. The speaker changes between segments
 *
 * @param segments - Array of transcript segments
 * @returns Array of grouped utterances
 */
export function groupByUtterance(segments: TranscriptSegment[]): UtteranceGroup[] {
  if (segments.length === 0) {
    return [];
  }

  const groups: UtteranceGroup[] = [];
  let currentGroup: {
    texts: string[];
    speaker?: number;
    startTime?: number;
    hasInterim: boolean;
  } | null = null;

  for (const segment of segments) {
    const text = segment.text.trim();

    // Skip empty segments
    if (!text) {
      continue;
    }

    // Check if we need to start a new group due to speaker change
    const speakerChanged = currentGroup !== null && segment.speaker !== currentGroup.speaker;

    if (currentGroup === null) {
      // Start first group
      currentGroup = {
        texts: [text],
        speaker: segment.speaker,
        startTime: segment.startTime,
        hasInterim: !segment.isFinal,
      };
    } else if (speakerChanged) {
      // Finalize current group and start new one
      groups.push({
        text: currentGroup.texts.join(" "),
        speaker: currentGroup.speaker,
        startTime: currentGroup.startTime,
        isInterim: currentGroup.hasInterim,
      });

      currentGroup = {
        texts: [text],
        speaker: segment.speaker,
        startTime: segment.startTime,
        hasInterim: !segment.isFinal,
      };
    } else {
      // Continue current group
      currentGroup.texts.push(text);
      if (!segment.isFinal) {
        currentGroup.hasInterim = true;
      }
    }

    // Check if this segment ends the utterance
    if (segment.isUtteranceEnd && currentGroup) {
      groups.push({
        text: currentGroup.texts.join(" "),
        speaker: currentGroup.speaker,
        startTime: currentGroup.startTime,
        isInterim: currentGroup.hasInterim,
      });
      currentGroup = null;
    }
  }

  // Don't forget the last group if it wasn't ended by isUtteranceEnd
  if (currentGroup && currentGroup.texts.length > 0) {
    groups.push({
      text: currentGroup.texts.join(" "),
      speaker: currentGroup.speaker,
      startTime: currentGroup.startTime,
      isInterim: currentGroup.hasInterim,
    });
  }

  return groups;
}
