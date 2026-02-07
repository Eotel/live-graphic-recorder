/**
 * Auto-scrolling summary panel displaying transcript and analysis.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useAutoScroll.ts, src/types/messages.ts
 */

import { useState, useEffect, useMemo, useRef, type TouchEvent } from "react";
import { Button } from "@/components/ui/button";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { cn } from "@/lib/utils";
import type { TranscriptSegment, SummaryPage } from "@/types/messages";
import { SummarySkeleton } from "./SummarySkeleton";
import { TranscriptLine } from "./TranscriptLine";
import { groupByUtterance } from "@/lib/transcript-utils";
import { useTranslation } from "react-i18next";

const SWIPE_MIN_DISTANCE_PX = 40;
const SWIPE_HORIZONTAL_RATIO = 1.2;
type SummaryViewMode = "paged" | "list";

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
  const { t } = useTranslation();
  const { containerRef } = useAutoScroll({ enabled: true });
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [summaryViewMode, setSummaryViewMode] = useState<SummaryViewMode>("paged");

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
  const isPagedView = summaryViewMode === "paged";
  const isListView = summaryViewMode === "list";
  const canPaginate = hasMultiplePages && isPagedView;

  const goToPrevious = () => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : summaryPages.length - 1));
  };

  const goToNext = () => {
    setCurrentIndex((prev) => (prev < summaryPages.length - 1 ? prev + 1 : 0));
  };

  const handleSummaryTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (!canPaginate) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleSummaryTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    if (!canPaginate) return;
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

  const toggleSummaryViewMode = () => {
    setSummaryViewMode((prev) => (prev === "paged" ? "list" : "paged"));
  };

  return (
    <div className={cn("flex flex-col h-full overflow-hidden", className)}>
      {/* Summary Section */}
      {showSkeleton ? (
        <div className="flex-shrink-0 mb-3">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">{t("summary.title")}</h3>
          <SummarySkeleton />
        </div>
      ) : hasPages && currentPage ? (
        <div
          className={cn("flex-shrink-0 mb-3", canPaginate && "[touch-action:pan-y]")}
          onTouchStart={handleSummaryTouchStart}
          onTouchEnd={handleSummaryTouchEnd}
        >
          <h3 className="text-sm font-semibold leading-none text-muted-foreground mb-2">
            {t("summary.title")}
          </h3>
          {isListView ? (
            <div
              className="max-h-56 overflow-y-auto rounded-md bg-muted/20 p-2 pr-3"
              data-testid="summary-list-container"
            >
              <div className="space-y-3">
                {summaryPages.map((page, pageIndex) => (
                  <section
                    key={`summary-page-${page.timestamp}-${pageIndex}`}
                    className="space-y-1.5 border-l-2 border-border/60 pl-2"
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("summary.pageLabel", { index: pageIndex + 1 })}
                    </p>
                    <ul className="space-y-1.5">
                      {page.points.map((point, pointIndex) => (
                        <li key={pointIndex} className="flex items-start gap-2 text-sm">
                          <span className="text-primary font-bold">-</span>
                          <span>{point}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          ) : (
            <ul className="space-y-1.5">
              {currentPage.points.map((point, index) => (
                <li key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-primary font-bold">-</span>
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          )}
          {hasMultiplePages && (
            <div
              className="mt-2 flex items-center justify-center gap-2"
              data-testid="summary-page-pager"
            >
              {isPagedView ? (
                <div className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2 py-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 rounded-sm text-muted-foreground hover:text-foreground"
                    onClick={goToPrevious}
                    aria-label={t("summary.previousPage")}
                  >
                    {"<"}
                  </Button>
                  <span className="px-2 text-xs font-medium leading-none tabular-nums text-muted-foreground">
                    {currentIndex + 1}/{summaryPages.length}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="size-6 rounded-sm text-muted-foreground hover:text-foreground"
                    onClick={goToNext}
                    aria-label={t("summary.nextPage")}
                  >
                    {">"}
                  </Button>
                </div>
              ) : null}
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full px-3 text-xs"
                onClick={toggleSummaryViewMode}
                aria-label={
                  isPagedView ? t("summary.switchToListView") : t("summary.switchToPagedView")
                }
              >
                {isPagedView ? t("summary.viewList") : t("summary.viewPaged")}
              </Button>
            </div>
          )}
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
          {t("summary.liveTranscript")}
        </h3>
        <div
          ref={containerRef}
          className="flex-1 min-h-0 overflow-y-auto rounded-md bg-muted/30 p-2"
        >
          {utteranceGroups.length === 0 ? (
            <span className="text-muted-foreground italic text-sm">
              {t("summary.emptyTranscript")}
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
