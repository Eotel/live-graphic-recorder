/**
 * Auto-scrolling summary panel displaying transcript and analysis.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useAutoScroll.ts, src/types/messages.ts
 */

import { useState, useEffect, useMemo, useRef, type TouchEvent } from "react";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { cn } from "@/lib/utils";
import type { TranscriptSegment, SummaryPage } from "@/types/messages";
import { SummarySkeleton } from "./SummarySkeleton";
import { TranscriptLine } from "./TranscriptLine";
import { groupByUtterance } from "@/lib/transcript-utils";

const SWIPE_MIN_DISTANCE_PX = 40;
const SWIPE_HORIZONTAL_RATIO = 1.2;

interface SummaryPanelProps {
  summaryPages: SummaryPage[];
  transcriptSegments: TranscriptSegment[];
  interimText: string | null;
  interimSpeaker?: number;
  interimStartTime?: number;
  speakerAliases?: Record<number, string>;
  onSpeakerLabelEdit?: (speaker: number, displayName: string) => void;
  isAnalyzing?: boolean;
  className?: string;
}

export function SummaryPanel({
  summaryPages,
  transcriptSegments,
  interimText,
  interimSpeaker,
  interimStartTime,
  speakerAliases = {},
  onSpeakerLabelEdit,
  isAnalyzing = false,
  className,
}: SummaryPanelProps) {
  const { containerRef } = useAutoScroll({ enabled: true });
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);

  // Auto-advance to latest page when new pages are added
  useEffect(() => {
    if (summaryPages.length > 0) {
      setCurrentIndex(summaryPages.length - 1);
    }
  }, [summaryPages.length]);

  // Group transcript segments by utterance
  const segmentsWithInterim = useMemo(() => {
    if (!interimText) return transcriptSegments;
    // Add interim text as a non-final segment for grouping
    return [
      ...transcriptSegments,
      {
        text: interimText,
        timestamp: Date.now(),
        isFinal: false,
        speaker: interimSpeaker,
        startTime: interimStartTime,
      },
    ];
  }, [transcriptSegments, interimText, interimSpeaker, interimStartTime]);

  const utteranceGroups = useMemo(
    () => groupByUtterance(segmentsWithInterim),
    [segmentsWithInterim],
  );

  const hasPages = summaryPages.length > 0;
  const hasMultiplePages = summaryPages.length > 1;
  const currentPage = summaryPages[currentIndex];
  const showSkeleton = isAnalyzing && !hasPages;

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : summaryPages.length - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < summaryPages.length - 1 ? prev + 1 : 0));
  };

  const handleSummaryTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!hasMultiplePages) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleSummaryTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (!hasMultiplePages) return;
    const touchStart = touchStartRef.current;
    touchStartRef.current = null;
    if (!touchStart) return;

    const touch = event.changedTouches[0];
    if (!touch) return;

    const deltaX = touch.clientX - touchStart.x;
    const deltaY = touch.clientY - touchStart.y;
    if (Math.abs(deltaX) < SWIPE_MIN_DISTANCE_PX) return;
    if (Math.abs(deltaX) <= Math.abs(deltaY) * SWIPE_HORIZONTAL_RATIO) return;

    if (deltaX < 0) {
      goToNext();
      return;
    }
    goToPrevious();
  };

  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>
      {/* Summary Section - fixed, never scrolls */}
      {showSkeleton ? (
        <div className="flex-shrink-0 mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Summary</h3>
          <SummarySkeleton />
        </div>
      ) : hasPages && currentPage ? (
        <div
          className="flex-shrink-0 mb-3 [touch-action:pan-y]"
          onTouchStart={handleSummaryTouchStart}
          onTouchEnd={handleSummaryTouchEnd}
        >
          <h3 className="text-sm font-semibold leading-none text-muted-foreground mb-2">Summary</h3>
          <ul className="space-y-1.5">
            {currentPage.points.map((point, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <span className="text-primary font-bold">-</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Transcript Section - scrollable */}
      <div
        className={cn(
          "flex-1 min-h-0 flex flex-col",
          (showSkeleton || hasPages) && "border-t border-border pt-3",
        )}
      >
        <h3 className="flex-shrink-0 text-sm font-semibold text-muted-foreground mb-2">
          Live Transcript
        </h3>
        <div
          ref={containerRef}
          className="flex-1 min-h-0 overflow-y-auto rounded-md bg-muted/30 p-2"
        >
          {utteranceGroups.length === 0 ? (
            <span className="text-muted-foreground italic text-sm">
              Start recording to see the transcript...
            </span>
          ) : (
            <div className="space-y-2">
              {utteranceGroups.map((group, index) => (
                <TranscriptLine
                  key={`utterance-${index}`}
                  text={group.text}
                  speaker={group.speaker}
                  startTime={group.startTime}
                  speakerAliases={speakerAliases}
                  onSpeakerLabelEdit={onSpeakerLabelEdit}
                  isInterim={group.isInterim}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
