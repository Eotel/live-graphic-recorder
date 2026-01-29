/**
 * MeetingSelector component for creating and joining meetings.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/hooks/useWebSocket.ts, src/types/messages.ts
 */

import { Button } from "@/components/ui/button";
import type { MeetingInfo } from "@/types/messages";

export interface MeetingSelectorProps {
  meetings: MeetingInfo[];
  activeMeetingId: string | null;
  onNewMeeting: (title?: string) => void;
  onJoinMeeting: (meetingId: string) => void;
  onRefresh: () => void;
  disabled: boolean;
  className?: string;
}

function formatDate(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - timestamp) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `Today ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else if (diffDays === 1) {
    return `Yesterday ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
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
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">Meeting</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onRefresh}
          disabled={disabled}
          aria-label="Refresh meeting list"
        >
          ↻
        </Button>
      </div>

      <Button onClick={() => onNewMeeting()} disabled={disabled} className="w-full">
        + New Meeting
      </Button>

      {meetings.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No previous meetings</p>
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
                <div className="font-medium truncate">{meeting.title || "Untitled Meeting"}</div>
                <div className="text-xs opacity-70">{formatDate(meeting.startedAt)}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
