/**
 * Current topic display component.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/App.tsx
 */

import { MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface TopicIndicatorProps {
  topics: string[];
  className?: string;
}

export function TopicIndicator({ topics, className }: TopicIndicatorProps) {
  const { t } = useTranslation();
  const currentTopic = topics[0] || t("summary.noTopicDetected");

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <MessageSquare className="size-4 text-muted-foreground" />
      <span className="font-medium">{currentTopic}</span>
    </div>
  );
}
