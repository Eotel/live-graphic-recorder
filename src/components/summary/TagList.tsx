/**
 * Tag chips display component.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/summary/SummaryPanel.tsx
 */

import { cn } from "@/lib/utils";

interface TagListProps {
  tags: string[];
  className?: string;
}

export function TagList({ tags, className }: TagListProps) {
  if (tags.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {tags.map((tag, index) => (
        <span
          key={index}
          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}
