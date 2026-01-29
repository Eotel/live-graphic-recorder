/**
 * Flow meter visual component.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/App.tsx
 */

import { cn } from "@/lib/utils";

interface FlowMeterProps {
  value: number; // 0-100
  className?: string;
}

export function FlowMeter({ value, className }: FlowMeterProps) {
  const normalizedValue = Math.max(0, Math.min(100, value));
  const segments = 10;
  const filledSegments = Math.round((normalizedValue / 100) * segments);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="text-xs font-medium text-muted-foreground w-10">Flow</span>
      <div className="flex gap-0.5">
        {Array.from({ length: segments }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "w-2 h-4 rounded-sm transition-colors",
              i < filledSegments ? "bg-blue-500" : "bg-muted",
            )}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground w-8">{normalizedValue}%</span>
    </div>
  );
}
