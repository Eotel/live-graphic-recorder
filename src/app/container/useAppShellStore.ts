import { useCallback, useRef, useSyncExternalStore } from "react";

import { alertReportDownloadError, triggerAnchorDownload } from "@/app/bridge";
import { buildDefaultReportUrl } from "@/app/usecases";
import { createAppStore, type AppStore } from "@/app/view-model/app-store";
import { useTranslation } from "react-i18next";

function createShellStore(getReportErrorPrefix: () => string): AppStore {
  return createAppStore({
    downloadReport: async (meetingId) => {
      triggerAnchorDownload(buildDefaultReportUrl(meetingId));
    },
    onDownloadReportError: (error) => {
      console.error("[Report] Download failed:", error);
      alertReportDownloadError(error, getReportErrorPrefix());
    },
  });
}

export function useAppShellStore() {
  const { i18n } = useTranslation();
  const appStoreRef = useRef<AppStore | null>(null);
  if (!appStoreRef.current) {
    appStoreRef.current = createShellStore(() => i18n.t("report.downloadFailed"));
  }
  const appStore = appStoreRef.current;

  const subscribeStore = useCallback(
    (listener: () => void) => appStore.subscribe(listener),
    [appStore],
  );
  const getStoreSnapshot = useCallback(() => appStore.getState(), [appStore]);
  const appState = useSyncExternalStore(subscribeStore, getStoreSnapshot, getStoreSnapshot);

  return {
    appStore,
    appState,
    appActions: appState.actions,
  };
}
