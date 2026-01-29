/**
 * Skeleton component for summary loading state.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/summary/SummaryPanel.tsx, src/components/ui/skeleton.tsx
 */

import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface SummarySkeletonProps {
  className?: string;
}

export function SummarySkeleton({ className }: SummarySkeletonProps) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-sm">Analyzing...</span>
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="h-4 w-3/5" />
      </div>
    </div>
  );
}
