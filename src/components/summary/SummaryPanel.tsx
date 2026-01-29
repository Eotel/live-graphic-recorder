/**
 * Auto-scrolling summary panel displaying transcript and analysis.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useAutoScroll.ts
 */

import { useAutoScroll } from "@/hooks/useAutoScroll";
import { cn } from "@/lib/utils";

interface SummaryPanelProps {
  summaryPoints: string[];
  transcript: string;
  className?: string;
}

export function SummaryPanel({ summaryPoints, transcript, className }: SummaryPanelProps) {
  const { containerRef } = useAutoScroll({ enabled: true });

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Summary Section */}
      {summaryPoints.length > 0 && (
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">Summary</h3>
          <ul className="space-y-2">
            {summaryPoints.map((point, index) => (
              <li key={index} className="flex items-start gap-2 text-sm">
                <span className="text-primary font-bold">-</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Transcript Section */}
      <div className="flex-1 min-h-0">
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">Live Transcript</h3>
        <div
          ref={containerRef}
          className="h-full overflow-y-auto rounded-md bg-muted/30 p-3 text-sm leading-relaxed"
        >
          {transcript || (
            <span className="text-muted-foreground italic">
              Start recording to see the transcript...
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
