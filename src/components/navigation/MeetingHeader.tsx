/**
 * MeetingHeader component for displaying meeting title and back navigation.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/App.tsx, src/components/pages/MeetingSelectPage.tsx
 */

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export interface MeetingHeaderProps {
  title?: string | null;
  onBackRequested: () => void;
  onUpdateTitle?: (title: string) => void;
}

export function MeetingHeader({ title, onBackRequested, onUpdateTitle }: MeetingHeaderProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const displayTitle = title?.trim() || t("meeting.untitled");

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleBack = () => {
    onBackRequested();
  };

  const handleTitleClick = () => {
    if (!onUpdateTitle) return;
    setEditValue(title?.trim() || "");
    setIsEditing(true);
  };

  const handleConfirm = () => {
    const newTitle = editValue.trim();
    setIsEditing(false);
    if (newTitle !== (title?.trim() || "") && onUpdateTitle) {
      onUpdateTitle(newTitle || t("meeting.untitled"));
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleConfirm();
    } else if (e.key === "Escape") {
      handleCancel();
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleBack}
        type="button"
        aria-label={t("common.back")}
        className="p-1"
      >
        <span>←</span>
      </Button>
      {isEditing ? (
        <input
          ref={inputRef}
          type="text"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleConfirm}
          onKeyDown={handleKeyDown}
          placeholder={t("meeting.titlePlaceholder")}
          className="text-sm font-medium bg-transparent border-b border-foreground/50 focus:border-foreground focus:outline-none px-0 py-0.5 max-w-[60vw]"
        />
      ) : (
        <button
          type="button"
          onClick={handleTitleClick}
          className="text-sm font-medium text-foreground truncate max-w-[60vw] hover:underline cursor-pointer"
          title={onUpdateTitle ? t("meeting.clickToEditTitle") : undefined}
        >
          {displayTitle}
        </button>
      )}
    </div>
  );
}
