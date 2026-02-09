import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
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

  document.body.appendChild(video);
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
    document.body.innerHTML = "";
  });

  test("attaches stream to video and plays when stream exists", () => {
    const stream = {} as MediaStream;
    const playMock = mock(() => Promise.resolve());
    const video = createVideoElement(playMock);
    const { result } = renderHook(() => useAttachMediaStream(stream));

    act(() => {
      result.current.videoRef(video);
    });

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

    const { result } = renderHook(() => useAttachMediaStream(stream));
    act(() => {
      result.current.videoRef(video);
    });

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

    const { result } = renderHook(() => useAttachMediaStream(stream));
    act(() => {
      result.current.videoRef(video);
    });

    await Promise.resolve();

    expect(warnMock).toHaveBeenCalledTimes(0);
  });

  test("re-attaches stream when ref target changes without stream change", () => {
    const stream = {} as MediaStream;
    const firstPlayMock = mock(() => Promise.resolve());
    const secondPlayMock = mock(() => Promise.resolve());
    const firstVideo = createVideoElement(firstPlayMock);
    const secondVideo = createVideoElement(secondPlayMock);

    const { result } = renderHook(() => useAttachMediaStream(stream));

    act(() => {
      result.current.videoRef(firstVideo);
    });
    expect(firstVideo.srcObject).toBe(stream);

    act(() => {
      result.current.videoRef(secondVideo);
    });

    expect(secondVideo.srcObject).toBe(stream);
    expect(secondPlayMock).toHaveBeenCalledTimes(1);
    expect(result.current.videoElementRef.current).toBe(secondVideo);
  });
});
