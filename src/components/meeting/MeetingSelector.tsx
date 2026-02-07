/**
 * MeetingSelector component for creating and joining meetings.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useMeetingController.ts, src/types/messages.ts
 */

import { Button } from "@/components/ui/button";
import type { MeetingInfo } from "@/types/messages";
import { useTranslation } from "react-i18next";
import { formatRelativeMeetingDate } from "@/i18n/format";

export interface MeetingSelectorProps {
  meetings: MeetingInfo[];
  activeMeetingId: string | null;
  onNewMeeting: (title?: string) => void;
  onJoinMeeting: (meetingId: string) => void;
  onRefresh: () => void;
  disabled: boolean;
  className?: string;
}

export function MeetingSelector({
  meetings,
  activeMeetingId,
  onNewMeeting,
  onJoinMeeting,
  onRefresh,
  disabled,
  className = "",
}: MeetingSelectorProps) {
  const { t, i18n } = useTranslation();

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">{t("meeting.sectionTitle")}</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={disabled}
          aria-label={t("meeting.refreshMeetingList")}
        >
          ↻
        </Button>
      </div>

      <Button onClick={() => onNewMeeting()} disabled={disabled} className="w-full">
        + {t("meeting.newMeeting")}
      </Button>

      {meetings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t("meeting.noPreviousMeetings")}
        </p>
      ) : (
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
          {meetings.map((meeting) => {
            const isActive = meeting.id === activeMeetingId;
            return (
              <button
                key={meeting.id}
                onClick={() => onJoinMeeting(meeting.id)}
                disabled={disabled || isActive}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent hover:text-accent-foreground"
                } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              >
                <div className="font-medium truncate">{meeting.title || t("meeting.untitled")}</div>
                <div className="text-xs opacity-70">
                  {formatRelativeMeetingDate(
                    meeting.startedAt,
                    i18n.resolvedLanguage ?? i18n.language,
                    t("meeting.unknownDate"),
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
