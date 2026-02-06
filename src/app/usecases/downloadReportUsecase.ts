const DEFAULT_UNLOCK_DELAY_MS = 2000;

export interface DownloadReportUsecaseDeps {
  getMeetingId: () => string | null;
  isLocked: () => boolean;
  lock: () => void;
  unlock: () => void;
  setDownloading: (downloading: boolean) => void;
  clearUnlockTimer: () => void;
  setUnlockTimer: (callback: () => void, delayMs: number) => void;
  triggerDownload: (url: string) => void;
  onError?: (error: unknown) => void;
  buildReportUrl?: (meetingId: string) => string;
  unlockDelayMs?: number;
}

export function buildDefaultReportUrl(meetingId: string): string {
  return `/api/meetings/${meetingId}/report.zip?media=auto`;
}

export function downloadReportUsecase(deps: DownloadReportUsecaseDeps): () => Promise<boolean> {
  return async () => {
    const meetingId = deps.getMeetingId();
    if (!meetingId || deps.isLocked()) {
      return false;
    }

    deps.lock();
    deps.setDownloading(true);

    try {
      const buildUrl = deps.buildReportUrl ?? buildDefaultReportUrl;
      const url = buildUrl(meetingId);
      deps.triggerDownload(url);
    } catch (error) {
      deps.onError?.(error);
      deps.unlock();
      deps.setDownloading(false);
      return false;
    }

    deps.clearUnlockTimer();
    deps.setUnlockTimer(() => {
      deps.unlock();
      deps.setDownloading(false);
    }, deps.unlockDelayMs ?? DEFAULT_UNLOCK_DELAY_MS);

    return true;
  };
}
