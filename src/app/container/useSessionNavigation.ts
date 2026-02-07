import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";

import { confirmDiscardUnsavedRecording } from "@/app/bridge";
import { logoutUsecase } from "@/app/usecases";
import type { AppStoreActions } from "@/app/view-model/app-store";
import type { UseAuthReturn } from "@/hooks/useAuth";
import type { UseLocalRecordingReturn } from "@/hooks/useLocalRecording";
import type { UseMeetingSessionReturn } from "@/hooks/useMeetingSession";
import type { UseRecordingControllerReturn } from "@/hooks/useRecordingController";
import { useTranslation } from "react-i18next";

interface UseSessionNavigationParams {
  auth: UseAuthReturn;
  session: UseMeetingSessionReturn;
  recording: UseRecordingControllerReturn;
  appActions: AppStoreActions;
  localRecordingRef: MutableRefObject<UseLocalRecordingReturn>;
  clearMeetingListRequestTimeout: () => void;
  hasUnsavedRecording: boolean;
}

export function useSessionNavigation({
  auth,
  session,
  recording,
  appActions,
  localRecordingRef,
  clearMeetingListRequestTimeout,
  hasUnsavedRecording,
}: UseSessionNavigationParams) {
  const { t } = useTranslation();
  const isLogoutInProgressRef = useRef(false);

  const handleBack = useCallback(() => {
    if (recording.isRecording) {
      recording.stop();
    }
    appActions.setRecordingState({ hasLocalFile: false });
    localRecordingRef.current.reset();
    session.stopMeeting();
    session.resetSession();
    appActions.setMeetingState({
      view: "select",
      pendingAction: null,
    });
  }, [appActions, localRecordingRef, recording, session]);

  const onBackRequested = useCallback(() => {
    if (
      hasUnsavedRecording &&
      !confirmDiscardUnsavedRecording(t("dialog.discardUnsavedRecording"))
    ) {
      return;
    }
    handleBack();
  }, [handleBack, hasUnsavedRecording, t]);

  const runLogout = useMemo(
    () =>
      logoutUsecase({
        isLogoutInProgress: () => isLogoutInProgressRef.current,
        setLogoutInProgress: (inProgress) => {
          isLogoutInProgressRef.current = inProgress;
          appActions.setAuthState({ isLogoutInProgress: inProgress });
        },
        beforeLogout: () => {
          if (recording.isRecording) {
            recording.stop();
          }
          clearMeetingListRequestTimeout();
          appActions.setMeetingState({
            isListLoading: false,
            listError: null,
            pendingAction: null,
            view: "select",
          });
          appActions.setRecordingState({ hasLocalFile: false });
          localRecordingRef.current.reset();
          session.disconnect();
          session.resetSession();
        },
        performLogout: auth.logout,
      }),
    [
      appActions,
      auth.logout,
      clearMeetingListRequestTimeout,
      localRecordingRef,
      recording,
      session,
    ],
  );

  const onLogout = useCallback(async () => {
    await runLogout();
  }, [runLogout]);

  useEffect(() => {
    if (auth.status === "authenticated") return;
    isLogoutInProgressRef.current = false;
    clearMeetingListRequestTimeout();
    appActions.setAuthState({ isLogoutInProgress: false });
    appActions.setMeetingState({ isListLoading: false, listError: null });
  }, [appActions, auth.status, clearMeetingListRequestTimeout]);

  return {
    isLogoutInProgressRef,
    onBackRequested,
    onLogout,
  };
}
