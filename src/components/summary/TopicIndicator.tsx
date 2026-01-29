/**
 * Current topic display component.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/App.tsx
 */

import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopicIndicatorProps {
  topics: string[];
  className?: string;
}

export function TopicIndicator({ topics, className }: TopicIndicatorProps) {
  const currentTopic = topics[0] || "No topic detected";

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <MessageSquare className="size-4 text-muted-foreground" />
      <span className="font-medium">{currentTopic}</span>
    </div>
  );
}
