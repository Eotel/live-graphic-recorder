import { useEffect, useRef, useState } from "react";
import { FileDown, Loader2, LogOut, Music, User } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { AudioDownloadOption } from "@/app/container/app-shell-types";
import { Button } from "@/components/ui/button";
import { toAppLanguage } from "@/i18n/config";
import { cn } from "@/lib/utils";

export interface FooterAccountMenuProps {
  hasMeeting: boolean;
  canDownloadAudio: boolean;
  isDownloadingReport: boolean;
  audioOptions: AudioDownloadOption[];
  isAudioOptionsLoading: boolean;
  audioOptionsError: string | null;
  onDownloadReport: () => Promise<void> | void;
  onOpenAudioList: () => Promise<void>;
  onDownloadAudio: (audioUrl: string) => void;
  onLogout: () => Promise<void> | void;
}

const LANGUAGES = [
  { code: "ja", label: "JA" },
  { code: "en", label: "EN" },
] as const;

export function FooterAccountMenu({
  hasMeeting,
  canDownloadAudio,
  isDownloadingReport,
  audioOptions,
  isAudioOptionsLoading,
  audioOptionsError,
  onDownloadReport,
  onOpenAudioList,
  onDownloadAudio,
  onLogout,
}: FooterAccountMenuProps) {
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [selectedAudioUrl, setSelectedAudioUrl] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const currentLanguage = toAppLanguage(i18n.resolvedLanguage ?? i18n.language);
  const canDownloadReport = hasMeeting && !isDownloadingReport;
  const canDownloadSelectedAudio =
    canDownloadAudio && selectedAudioUrl.length > 0 && !isAudioOptionsLoading;

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

  useEffect(() => {
    if (!isOpen || !hasMeeting) {
      return;
    }
    void onOpenAudioList();
  }, [hasMeeting, isOpen, onOpenAudioList]);

  useEffect(() => {
    if (audioOptions.length === 0) {
      setSelectedAudioUrl("");
      return;
    }

    setSelectedAudioUrl((current) => {
      if (audioOptions.some((option) => option.url === current)) {
        return current;
      }
      return audioOptions[0]!.url;
    });
  }, [audioOptions]);

  return (
    <div className="relative" ref={containerRef}>
      <Button
        variant="outline"
        size="icon-sm"
        type="button"
        aria-label={t("common.accountMenu")}
        title={t("common.accountMenu")}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((value) => !value)}
        className={cn(isOpen && "bg-accent text-accent-foreground")}
      >
        <User className="h-4 w-4" />
      </Button>

      {isOpen && (
        <div
          role="menu"
          className="absolute bottom-full left-0 z-30 mb-2 w-72 rounded-md border border-border bg-popover p-1 shadow-md"
        >
          <div className="px-2 py-1">
            <p className="mb-1 text-[11px] font-medium text-muted-foreground">
              {t("common.language")}
            </p>
            <div
              role="group"
              aria-label={t("common.language")}
              className="inline-flex rounded-md border border-border bg-background p-0.5"
            >
              {LANGUAGES.map((language) => {
                const isActive = currentLanguage === language.code;
                return (
                  <button
                    key={language.code}
                    type="button"
                    role="menuitemradio"
                    aria-checked={isActive}
                    className={cn(
                      "rounded-sm px-2 py-1 text-xs font-medium transition-colors",
                      isActive
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => {
                      setIsOpen(false);
                      void i18n.changeLanguage(language.code);
                    }}
                  >
                    {language.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="my-1 h-px bg-border" />

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
            {isDownloadingReport ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            {t("report.download")}
          </button>

          <div className="my-1 border-t border-border" />

          <div className="px-2 py-1">
            <div className="mb-1 flex items-center gap-2 text-sm text-foreground">
              <Music className="h-4 w-4" />
              <span>{t("report.downloadAudio")}</span>
            </div>

            {isAudioOptionsLoading ? (
              <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>{t("report.audioLoading")}</span>
              </div>
            ) : null}

            {!isAudioOptionsLoading && audioOptionsError ? (
              <div className="py-1 text-xs text-destructive">{audioOptionsError}</div>
            ) : null}

            {!isAudioOptionsLoading && !audioOptionsError && audioOptions.length === 0 ? (
              <div className="py-1 text-xs text-muted-foreground">{t("report.audioEmpty")}</div>
            ) : null}

            {!isAudioOptionsLoading && audioOptions.length > 0 ? (
              <div className="space-y-2">
                <label className="sr-only" htmlFor="footer-audio-download-select">
                  {t("report.audioSelectLabel")}
                </label>
                <select
                  id="footer-audio-download-select"
                  value={selectedAudioUrl}
                  onChange={(event) => setSelectedAudioUrl(event.target.value)}
                  className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                >
                  {audioOptions.map((option) => (
                    <option key={option.id} value={option.url}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <button
              type="button"
              role="menuitem"
              disabled={!canDownloadSelectedAudio}
              className="mt-2 flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
              onClick={() => {
                setIsOpen(false);
                if (!canDownloadSelectedAudio) {
                  return;
                }
                onDownloadAudio(selectedAudioUrl);
              }}
            >
              <Music className="h-4 w-4" />
              {t("report.downloadSelectedAudio")}
            </button>
          </div>

          <div className="my-1 h-px bg-border" />

          <button
            type="button"
            role="menuitem"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
            onClick={() => {
              setIsOpen(false);
              void onLogout();
            }}
          >
            <LogOut className="h-4 w-4" />
            {t("common.logout")}
          </button>
        </div>
      )}
    </div>
  );
}

export default FooterAccountMenu;
