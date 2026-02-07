import { useEffect, useRef, useState } from "react";
import { ChevronDown, FileDown, Loader2, Music } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface DownloadMenuButtonProps {
  hasMeeting: boolean;
  canDownloadAudio: boolean;
  isDownloadingReport: boolean;
  onDownloadReport: () => Promise<void> | void;
  onDownloadAudio: () => void;
}

export function DownloadMenuButton({
  hasMeeting,
  canDownloadAudio,
  isDownloadingReport,
  onDownloadReport,
  onDownloadAudio,
}: DownloadMenuButtonProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const canDownloadReport = hasMeeting && !isDownloadingReport;
  const canOpenMenu = canDownloadReport || canDownloadAudio;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="outline"
        size="sm"
        type="button"
        disabled={!canOpenMenu}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
        className="gap-2"
      >
        {isDownloadingReport && <Loader2 className="h-4 w-4 animate-spin" />}
        <span>{t("report.menu")}</span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
      </Button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-44 rounded-md border border-border bg-popover p-1 shadow-md"
        >
          <button
            type="button"
            role="menuitem"
            disabled={!canDownloadReport}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            onClick={() => {
              setIsOpen(false);
              if (!canDownloadReport) {
                return;
              }
              void onDownloadReport();
            }}
          >
            <FileDown className="h-4 w-4" />
            {t("report.download")}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={!canDownloadAudio}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
            onClick={() => {
              setIsOpen(false);
              if (!canDownloadAudio) {
                return;
              }
              onDownloadAudio();
            }}
          >
            <Music className="h-4 w-4" />
            {t("report.downloadAudio")}
          </button>
        </div>
      )}
    </div>
  );
}
