export function hasLocalAudioFile(sessionId: string | null, totalChunks: number): boolean {
  return sessionId !== null && totalChunks > 0;
}

export function isUploadedForCurrentSession(
  uploadedSessionId: string | null,
  localSessionId: string | null,
): boolean {
  return (
    uploadedSessionId !== null && localSessionId !== null && uploadedSessionId === localSessionId
  );
}

export function shouldClearLocalFileOnUpload(
  hasLocalFile: boolean,
  uploadedSessionId: string | null,
  localSessionId: string | null,
): boolean {
  if (!hasLocalFile) {
    return false;
  }
  return isUploadedForCurrentSession(uploadedSessionId, localSessionId);
}

export function hasUnsavedRecording(isRecording: boolean, hasLocalFile: boolean): boolean {
  return isRecording || hasLocalFile;
}
