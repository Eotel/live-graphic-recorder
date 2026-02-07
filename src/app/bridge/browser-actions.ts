export function confirmDiscardUnsavedRecording(message: string): boolean {
  if (typeof globalThis.confirm !== "function") {
    return true;
  }

  return globalThis.confirm(message);
}

export function triggerAnchorDownload(url: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function alertReportDownloadError(error: unknown, prefixMessage: string): void {
  if (typeof globalThis.alert !== "function") {
    return;
  }

  const message = error instanceof Error ? error.message : "";
  globalThis.alert(`${prefixMessage}${message ? `\n\n${message}` : ""}`.trim());
}
