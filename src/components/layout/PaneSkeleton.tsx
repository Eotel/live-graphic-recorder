/**
 * Skeleton placeholder shown when a pane is popped out to a separate window.
 *
 * Related: src/components/layout/PopoutPane.tsx, src/logic/pane-state-controller.ts
 */

import type { PaneId } from "@/logic/pane-state-controller";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface PaneSkeletonProps {
  paneId: PaneId;
  label: string;
  onFocus?: () => void;
  className?: string;
}

export function PaneSkeleton({ label, onFocus, className }: PaneSkeletonProps) {
  const { t } = useTranslation();

  return (
    <div
      role={onFocus ? "button" : undefined}
      tabIndex={onFocus ? 0 : undefined}
      onClick={onFocus}
      onKeyDown={
        onFocus
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") onFocus();
            }
          : undefined
      }
      className={cn(
        "flex flex-col items-center justify-center gap-3 h-full rounded-lg bg-muted/50 border border-dashed border-border text-muted-foreground",
        onFocus && "cursor-pointer hover:bg-muted/80 transition-colors",
        className,
      )}
    >
      <ExternalLink className="size-8" />
      <p className="text-sm font-medium">{t("layout.paneOpenInSeparateWindow", { label })}</p>
      {onFocus && <p className="text-xs">{t("layout.clickToFocus")}</p>}
    </div>
  );
}
