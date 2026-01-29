/**
 * MeetingHeader component for displaying meeting title and back navigation.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/App.tsx, src/components/pages/MeetingSelectPage.tsx
 */

import { Button } from "@/components/ui/button";

export interface MeetingHeaderProps {
  title?: string | null;
  onBack: () => void;
  isRecording: boolean;
}

export function MeetingHeader({ title, onBack, isRecording }: MeetingHeaderProps) {
  const handleBack = () => {
    if (isRecording) {
      if (typeof globalThis.confirm === "function") {
        const confirmed = globalThis.confirm("Recording in progress. Stop and return to meeting selection?");
        if (!confirmed) {
          return;
        }
      }
    }
    onBack();
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleBack}
        type="button"
        aria-label="Back"
        className="p-1"
      >
        <span>←</span>
      </Button>
      <span className="text-sm font-medium text-foreground truncate max-w-[60vw]">
        {title?.trim() ? title : "Untitled Meeting"}
      </span>
    </div>
  );
}
