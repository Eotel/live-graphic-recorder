import { useEffect } from "react";

export function useAttachMediaStream(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  stream: MediaStream | null,
): void {
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    video.srcObject = stream;
    if (!stream) {
      return;
    }

    void video.play().catch((error: unknown) => {
      if (error instanceof Error && error.name !== "NotAllowedError") {
        console.warn("Video play failed:", error);
      }
    });
  }, [videoRef, stream]);
}
