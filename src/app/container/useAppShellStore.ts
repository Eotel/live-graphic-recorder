import { useCallback, useRef, useSyncExternalStore } from "react";

import { alertReportDownloadError, triggerAnchorDownload } from "@/app/bridge";
import { buildDefaultReportUrl } from "@/app/usecases";
import {
  createAppStore,
  type AppStore,
  type AppStoreDependencies,
} from "@/app/view-model/app-store";
import { useTranslation } from "react-i18next";

function createShellStore(
  getReportErrorPrefix: () => string,
  depsRef: { current: Partial<AppStoreDependencies> },
): AppStore {
  return createAppStore({
    downloadReport: async (meetingId) => {
      triggerAnchorDownload(buildDefaultReportUrl(meetingId));
    },
    onDownloadReportError: (error) => {
      console.error("[Report] Download failed:", error);
      alertReportDownloadError(error, getReportErrorPrefix());
    },
    updateMeetingTitle: (title) => depsRef.current.updateMeetingTitle?.(title),
    setImageModelPreset: (preset) => depsRef.current.setImageModelPreset?.(preset),
    setAudioDevice: (deviceId) => depsRef.current.setAudioDevice?.(deviceId),
    setVideoDevice: (deviceId) => depsRef.current.setVideoDevice?.(deviceId),
    switchSourceType: (type) => depsRef.current.switchSourceType?.(type),
    switchVideoSource: (type) => depsRef.current.switchVideoSource?.(type) ?? false,
  });
}

export function useAppShellStore(dependencies: Partial<AppStoreDependencies> = {}) {
  const { i18n } = useTranslation();
  const depsRef = useRef<Partial<AppStoreDependencies>>(dependencies);
  depsRef.current = dependencies;
  const appStoreRef = useRef<AppStore | null>(null);
  if (!appStoreRef.current) {
    appStoreRef.current = createShellStore(() => i18n.t("report.downloadFailed"), depsRef);
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
