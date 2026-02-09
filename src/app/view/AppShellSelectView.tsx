import { Button } from "@/components/ui/button";
import { MeetingSelectPage } from "@/components/pages/MeetingSelectPage";
import { LanguageToggle } from "@/components/navigation/LanguageToggle";
import type { MeetingInfo } from "@/types/messages";
import { useTranslation } from "react-i18next";

interface AppShellSelectViewProps {
  meetings: MeetingInfo[];
  isLoading: boolean;
  isConnected: boolean;
  errorMessage: string | null;
  onNewMeeting: (title?: string) => void;
  onSelectMeeting: (meetingId: string) => void;
  onRefreshMeetings: () => void;
  canOpenAdmin?: boolean;
  onOpenAdmin?: () => void;
  onLogout: () => Promise<void>;
}

export function AppShellSelectView({
  meetings,
  isLoading,
  isConnected,
  errorMessage,
  onNewMeeting,
  onSelectMeeting,
  onRefreshMeetings,
  canOpenAdmin = false,
  onOpenAdmin,
  onLogout,
}: AppShellSelectViewProps) {
  const { t } = useTranslation();

  return (
    <div className="relative">
      <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
        <LanguageToggle />
        {canOpenAdmin && onOpenAdmin ? (
          <Button variant="outline" size="sm" type="button" onClick={onOpenAdmin}>
            {t("admin.title")}
          </Button>
        ) : null}
        <Button variant="outline" size="sm" type="button" onClick={onLogout}>
          {t("common.logout")}
        </Button>
      </div>
      <MeetingSelectPage
        meetings={meetings}
        isLoading={isLoading}
        isConnected={isConnected}
        errorMessage={errorMessage}
        onNewMeeting={onNewMeeting}
        onSelectMeeting={onSelectMeeting}
        onRefresh={onRefreshMeetings}
        onRetry={onRefreshMeetings}
      />
    </div>
  );
}
