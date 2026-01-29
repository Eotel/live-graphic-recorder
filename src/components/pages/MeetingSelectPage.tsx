/**
 * MeetingSelectPage component for selecting or creating meetings.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/App.tsx, src/components/meeting/MeetingSelector.tsx
 */

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import type { MeetingInfo } from "@/types/messages";

export interface MeetingSelectPageProps {
  meetings?: MeetingInfo[] | null;
  isLoading: boolean;
  onNewMeeting: (title?: string) => void;
  onSelectMeeting: (meetingId: string) => void;
  onRefresh: () => void;
}

function normalizeTimestamp(timestamp: number): number {
  // Heuristic: treat 10-digit epoch as seconds.
  if (timestamp > 0 && timestamp < 1_000_000_000_000) {
    return timestamp * 1000;
  }
  return timestamp;
}

function formatDate(timestamp: number | null | undefined): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return "Unknown";
  }

  const normalized = normalizeTimestamp(timestamp);
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) {
    return "Unknown";
  }

  const now = new Date();
  const diffMs = now.getTime() - normalized;
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.floor((startOfDay(now) - startOfDay(date)) / (1000 * 60 * 60 * 24));

  if (diffMs < 0) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  } else if (diffDays === 0) {
    return `Today ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else if (diffDays === 1) {
    return `Yesterday ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }
}

export function MeetingSelectPage({
  meetings,
  isLoading,
  onNewMeeting,
  onSelectMeeting,
  onRefresh,
}: MeetingSelectPageProps) {
  const meetingList = meetings ?? [];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-md flex flex-col gap-8">
        {/* App Title */}
        <h1 className="text-3xl font-bold text-center text-foreground">Live Graphic Recorder</h1>

        {/* New Meeting Button */}
        <Button
          onClick={() => onNewMeeting()}
          size="lg"
          type="button"
          className="w-full py-6 text-lg"
        >
          Start New Meeting
        </Button>

        {/* Past Meetings Section */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">Past Meetings</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              type="button"
              disabled={isLoading}
              aria-label="Refresh"
            >
              ↻
            </Button>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading...</p>
          ) : meetingList.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No past meetings</p>
          ) : (
            <div className="flex flex-col gap-2 max-h-96 overflow-y-auto">
              {meetingList.map((meeting) => (
                <button
                  key={meeting.id}
                  onClick={() => onSelectMeeting(meeting.id)}
                  type="button"
                  className="w-full text-left px-4 py-3 rounded-lg border border-border bg-card hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <div className="font-medium truncate">{meeting.title || "Untitled Meeting"}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {formatDate(meeting.startedAt)}
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
