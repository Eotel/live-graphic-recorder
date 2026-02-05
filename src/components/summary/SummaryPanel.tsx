/**
 * Auto-scrolling summary panel displaying transcript and analysis.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useAutoScroll.ts, src/types/messages.ts
 */

import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { TranscriptSegment, SummaryPage } from "@/types/messages";
import { SummarySkeleton } from "./SummarySkeleton";
import { TranscriptLine } from "./TranscriptLine";
import { groupByUtterance } from "@/lib/transcript-utils";

interface SummaryPanelProps {
  summaryPages: SummaryPage[];
  transcriptSegments: TranscriptSegment[];
  interimText: string | null;
  interimSpeaker?: number;
  interimStartTime?: number;
  isAnalyzing?: boolean;
  className?: string;
}

export function SummaryPanel({
  summaryPages,
  transcriptSegments,
  interimText,
  interimSpeaker,
  interimStartTime,
  isAnalyzing = false,
  className,
}: SummaryPanelProps) {
  const { containerRef } = useAutoScroll({ enabled: true });

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

  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>
      {/* Summary Section - fixed, never scrolls */}
      {showSkeleton ? (
        <div className="flex-shrink-0 mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Summary</h3>
          <SummarySkeleton />
        </div>
      ) : hasPages && currentPage ? (
        <div className="flex-shrink-0 mb-3">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-muted-foreground">Summary</h3>
            {hasMultiplePages && (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={goToPrevious}
                  aria-label="Previous summary page"
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  onClick={goToNext}
                  aria-label="Next summary page"
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
          <ul className="space-y-1.5">
            {currentPage.points.map((point, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <span className="text-primary font-bold">-</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
          {hasMultiplePages && (
            <div className="text-center text-xs text-muted-foreground mt-2">
              {currentIndex + 1} / {summaryPages.length}
            </div>
          )}
        </div>
      ) : null}

      {/* Transcript Section - scrollable */}
      <div className="flex-1 min-h-0 flex flex-col">
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
