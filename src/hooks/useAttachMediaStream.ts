import { useCallback, useEffect, useRef } from "react";

interface AttachMediaStreamResult {
  videoRef: React.RefCallback<HTMLVideoElement>;
  videoElementRef: React.RefObject<HTMLVideoElement | null>;
}

function attachStream(video: HTMLVideoElement, stream: MediaStream | null): void {
  video.srcObject = stream;
  if (!stream) {
    return;
  }

  void video.play().catch((error: unknown) => {
    if (error instanceof Error && error.name !== "NotAllowedError") {
      console.warn("Video play failed:", error);
    }
  });
}

export function useAttachMediaStream(stream: MediaStream | null): AttachMediaStreamResult {
  const videoElementsRef = useRef<HTMLVideoElement[]>([]);
  const videoElementRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(stream);

  const syncConnectedVideoElements = useCallback(() => {
    videoElementsRef.current = videoElementsRef.current.filter((video) => video.isConnected);
    videoElementRef.current = videoElementsRef.current.at(-1) ?? null;
  }, []);

  const videoRef = useCallback(
    (video: HTMLVideoElement | null) => {
      if (!video) {
        syncConnectedVideoElements();
        return;
      }

      if (!videoElementsRef.current.includes(video)) {
        videoElementsRef.current.push(video);
      }
      syncConnectedVideoElements();
      attachStream(video, streamRef.current);
    },
    [syncConnectedVideoElements],
  );

  useEffect(() => {
    streamRef.current = stream;
    syncConnectedVideoElements();
    for (const video of videoElementsRef.current) {
      attachStream(video, stream);
    }
  }, [stream, syncConnectedVideoElements]);

  return { videoRef, videoElementRef };
}
