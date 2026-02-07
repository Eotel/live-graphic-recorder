import { LoginPage } from "@/components/pages/LoginPage";
import type { AppShellViewModel } from "@/app/container/useAppShellController";
import { AppShellSelectView } from "./AppShellSelectView";
import { AppShellRecordingView } from "./AppShellRecordingView";
import { LanguageToggle } from "@/components/navigation/LanguageToggle";
import { useTranslation } from "react-i18next";

interface AppShellViewProps {
  viewModel: AppShellViewModel;
}

export function AppShellView({ viewModel }: AppShellViewProps) {
  const { t } = useTranslation();
  const { auth, appState, onNewMeeting, onSelectMeeting, onRefreshMeetings, onLogout } = viewModel;

  if (auth.status === "loading") {
    return (
      <div className="relative min-h-screen bg-background">
        <div className="absolute right-4 top-4 z-20">
          <LanguageToggle />
        </div>
        <div className="min-h-screen flex items-center justify-center text-muted-foreground">
          {t("auth.checkingStatus")}
        </div>
      </div>
    );
  }

  if (auth.status !== "authenticated") {
    return (
      <div className="relative">
        <div className="absolute right-4 top-4 z-20">
          <LanguageToggle />
        </div>
        <LoginPage
          isSubmitting={auth.isSubmitting}
          error={auth.error}
          onLogin={auth.login}
          onSignup={auth.signup}
        />
      </div>
    );
  }

  if (appState.meeting.view === "select") {
    return (
      <AppShellSelectView
        meetings={appState.meeting.meetingList}
        isLoading={appState.meeting.isListLoading}
        isConnected={appState.meeting.isConnected}
        errorMessage={appState.meeting.listError}
        onNewMeeting={onNewMeeting}
        onSelectMeeting={onSelectMeeting}
        onRefreshMeetings={onRefreshMeetings}
        onLogout={onLogout}
      />
    );
  }

  return <AppShellRecordingView viewModel={viewModel} />;
}
