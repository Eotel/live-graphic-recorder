export function confirmDiscardUnsavedRecording(): boolean {
  if (typeof globalThis.confirm !== "function") {
    return true;
  }

  return globalThis.confirm("You have unsaved local audio. Leave this meeting and discard it?");
}

export function triggerAnchorDownload(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function alertReportDownloadError(error: unknown): void {
  if (typeof globalThis.alert !== "function") {
    return;
  }

  const message = error instanceof Error ? error.message : "";
  globalThis.alert(
    `レポートのダウンロードに失敗しました。${message ? `\n\n${message}` : ""}`.trim(),
  );
}
