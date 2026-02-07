/**
 * Pane toolbar with expand/collapse/popout buttons.
 *
 * Related: src/logic/pane-state-controller.ts, src/hooks/usePaneState.ts
 */

import type { PaneId } from "@/logic/pane-state-controller";
import { Maximize2, Minimize2, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";

interface PaneToolbarProps {
  paneId: PaneId;
  mode: "normal" | "expanded" | "popout";
  onExpand: () => void;
  onCollapse: () => void;
  onPopout: () => void;
  className?: string;
}

export function PaneToolbar({ mode, onExpand, onCollapse, onPopout, className }: PaneToolbarProps) {
  const { t } = useTranslation();

  if (mode === "popout") {
    return null;
  }

  return (
    <div
      className={cn(
        "absolute top-1 right-1 z-10 flex gap-1 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity",
        className,
      )}
    >
      {mode === "normal" && (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onExpand}
            aria-label={t("layout.expandPane")}
            className="bg-background/80 backdrop-blur-sm"
          >
            <Maximize2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onPopout}
            aria-label={t("layout.popoutPane")}
            className="hidden md:inline-flex bg-background/80 backdrop-blur-sm"
          >
            <ExternalLink className="size-4" />
          </Button>
        </>
      )}
      {mode === "expanded" && (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onCollapse}
          aria-label={t("layout.collapsePane")}
          className="bg-background/80 backdrop-blur-sm"
        >
          <Minimize2 className="size-4" />
        </Button>
      )}
    </div>
  );
}
