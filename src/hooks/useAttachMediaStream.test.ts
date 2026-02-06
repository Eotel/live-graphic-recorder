import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { renderHook } from "@testing-library/react";
import { useAttachMediaStream } from "./useAttachMediaStream";

function createVideoElement(playImpl: () => Promise<void>) {
  const video = document.createElement("video");
  let attachedStream: MediaStream | null = null;

  Object.defineProperty(video, "srcObject", {
    configurable: true,
    get: () => attachedStream,
    set: (value: MediaProvider | null) => {
      attachedStream = value as MediaStream | null;
    },
  });

  Object.defineProperty(video, "play", {
    configurable: true,
    value: playImpl,
  });

  return video;
}

type MediaProvider = MediaSource | Blob | MediaStream;

describe("useAttachMediaStream", () => {
  let originalWarn: typeof console.warn;

  beforeEach(() => {
    originalWarn = console.warn;
  });

  afterEach(() => {
    console.warn = originalWarn;
  });

  test("attaches stream to video and plays when stream exists", () => {
    const stream = {} as MediaStream;
    const playMock = mock(() => Promise.resolve());
    const video = createVideoElement(playMock);
    const videoRef = { current: video } as React.RefObject<HTMLVideoElement | null>;

    renderHook(() => useAttachMediaStream(videoRef, stream));

    expect(video.srcObject).toBe(stream);
    expect(playMock).toHaveBeenCalledTimes(1);
  });

  test("warns only for non-NotAllowedError", async () => {
    const stream = {} as MediaStream;
    const playError = new Error("play failed");
    playError.name = "AbortError";
    const playMock = mock(() => Promise.reject(playError));
    const video = createVideoElement(playMock);

    const warnMock = mock(() => {});
    console.warn = warnMock as typeof console.warn;

    const videoRef = { current: video } as React.RefObject<HTMLVideoElement | null>;
    renderHook(() => useAttachMediaStream(videoRef, stream));

    await Promise.resolve();

    expect(warnMock).toHaveBeenCalledTimes(1);
  });

  test("does not warn for NotAllowedError", async () => {
    const stream = {} as MediaStream;
    const playError = new Error("autoplay blocked");
    playError.name = "NotAllowedError";
    const playMock = mock(() => Promise.reject(playError));
    const video = createVideoElement(playMock);

    const warnMock = mock(() => {});
    console.warn = warnMock as typeof console.warn;

    const videoRef = { current: video } as React.RefObject<HTMLVideoElement | null>;
    renderHook(() => useAttachMediaStream(videoRef, stream));

    await Promise.resolve();

    expect(warnMock).toHaveBeenCalledTimes(0);
  });
});
