/**
 * MeetingSelectPage component for selecting or creating meetings.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/App.tsx, src/components/meeting/MeetingSelector.tsx
 */

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { MeetingInfo } from "@/types/messages";
import { useTranslation } from "react-i18next";
import { formatRelativeMeetingDate } from "@/i18n/format";

export interface MeetingSelectPageProps {
  meetings?: MeetingInfo[] | null;
  isLoading: boolean;
  isConnected?: boolean;
  errorMessage?: string | null;
  onNewMeeting: (title?: string) => void;
  onSelectMeeting: (meetingId: string) => void;
  onRefresh: () => void;
  onRetry?: () => void;
}

export function MeetingSelectPage({
  meetings,
  isLoading,
  isConnected = true,
  errorMessage = null,
  onNewMeeting,
  onSelectMeeting,
  onRefresh,
  onRetry,
}: MeetingSelectPageProps) {
  const { t, i18n } = useTranslation();
  const meetingList = meetings ?? [];
  const showInitialLoading = isLoading && meetingList.length === 0;
  const showInlineLoading = isLoading && meetingList.length > 0;
  const retryAction = onRetry ?? onRefresh;
  const [showTitleDialog, setShowTitleDialog] = useState(false);
  const [titleInput, setTitleInput] = useState("");
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Focus input when dialog opens
  useEffect(() => {
    if (showTitleDialog && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [showTitleDialog]);

  const handleNewMeetingClick = () => {
    setTitleInput("");
    setShowTitleDialog(true);
  };

  const handleConfirmNewMeeting = () => {
    const title = titleInput.trim() || undefined;
    setShowTitleDialog(false);
    setTitleInput("");
    onNewMeeting(title);
  };

  const handleCancelDialog = () => {
    setShowTitleDialog(false);
    setTitleInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirmNewMeeting();
    } else if (e.key === "Escape") {
      handleCancelDialog();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      {/* Title Dialog */}
      {showTitleDialog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={handleCancelDialog}
          onKeyDown={(e) => e.key === "Escape" && handleCancelDialog()}
        >
          <div
            className="bg-card rounded-lg p-6 w-full max-w-sm mx-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-foreground mb-4">
              {t("meeting.newMeetingDialogTitle")}
            </h2>
            <input
              ref={titleInputRef}
              type="text"
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t("meeting.titlePlaceholderOptional")}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <div className="flex gap-3 mt-4">
              <Button
                variant="outline"
                onClick={handleCancelDialog}
                type="button"
                className="flex-1"
              >
                {t("common.cancel")}
              </Button>
              <Button onClick={handleConfirmNewMeeting} type="button" className="flex-1">
                {t("common.start")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="w-full max-w-md flex flex-col gap-8">
        {/* App Title */}
        <h1 className="text-3xl font-bold text-center text-foreground">{t("common.appName")}</h1>

        {/* New Meeting Button */}
        <Button
          onClick={handleNewMeetingClick}
          size="lg"
          type="button"
          className="w-full py-6 text-lg"
        >
          {t("meeting.startNewMeeting")}
        </Button>

        {/* Past Meetings Section */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              {t("meeting.pastMeetings")}
            </h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              type="button"
              aria-label={t("meeting.refresh")}
            >
              ↻
            </Button>
          </div>

          {errorMessage && (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
              <p className="text-xs text-destructive">{errorMessage}</p>
              <Button
                variant="outline"
                size="sm"
                type="button"
                onClick={retryAction}
                className="mt-2 h-7 px-2 text-xs"
              >
                {t("common.retry")}
              </Button>
            </div>
          )}

          {!errorMessage && !isConnected && (
            <p className="text-xs text-muted-foreground">{t("meeting.listConnectionUnstable")}</p>
          )}

          {showInlineLoading && (
            <p className="text-xs text-muted-foreground text-center">{t("meeting.listUpdating")}</p>
          )}

          {showInitialLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t("common.loading")}</p>
          ) : meetingList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t("meeting.noPastMeetings")}
            </p>
          ) : (
            <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
              {meetingList.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => onSelectMeeting(meeting.id)}
                  type="button"
                  className="w-full text-left px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <div className="font-medium truncate">
                    {meeting.title || t("meeting.untitled")}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatRelativeMeetingDate(
                      meeting.startedAt,
                      i18n.resolvedLanguage ?? i18n.language,
                      t("meeting.unknownDate"),
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
