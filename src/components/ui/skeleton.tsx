/**
 * Base skeleton component for loading states.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/summary/SummarySkeleton.tsx, src/components/graphics/ImageSkeleton.tsx
 */

import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}
