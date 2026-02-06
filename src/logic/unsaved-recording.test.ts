import { describe, expect, test } from "bun:test";
import {
  hasLocalAudioFile,
  hasUnsavedRecording,
  isUploadedForCurrentSession,
  shouldClearLocalFileOnUpload,
} from "./unsaved-recording";

describe("unsaved recording guards", () => {
  test("hasLocalAudioFile returns true only when session exists and chunks > 0", () => {
    expect(hasLocalAudioFile("session-1", 1)).toBe(true);
    expect(hasLocalAudioFile("session-1", 0)).toBe(false);
    expect(hasLocalAudioFile(null, 10)).toBe(false);
  });

  test("isUploadedForCurrentSession matches same session only", () => {
    expect(isUploadedForCurrentSession("session-1", "session-1")).toBe(true);
    expect(isUploadedForCurrentSession("session-2", "session-1")).toBe(false);
    expect(isUploadedForCurrentSession(null, "session-1")).toBe(false);
    expect(isUploadedForCurrentSession("session-1", null)).toBe(false);
  });

  test("shouldClearLocalFileOnUpload clears only when upload target matches local session", () => {
    expect(shouldClearLocalFileOnUpload(true, "session-1", "session-1")).toBe(true);
    expect(shouldClearLocalFileOnUpload(true, "session-2", "session-1")).toBe(false);
    expect(shouldClearLocalFileOnUpload(false, "session-1", "session-1")).toBe(false);
  });

  test("hasUnsavedRecording stays true while recording even without local file", () => {
    expect(hasUnsavedRecording(true, false, null)).toBe(true);
  });

  test("hasUnsavedRecording is true for unuploaded local file", () => {
    expect(hasUnsavedRecording(false, true, "session-1")).toBe(true);
    expect(hasUnsavedRecording(false, true, null)).toBe(false);
  });
});
