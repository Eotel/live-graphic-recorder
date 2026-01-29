/**
 * Hook for detecting audio level from a MediaStream.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/components/recording/AudioLevelIndicator.tsx
 */

import { useState, useEffect, useRef } from "react";

export interface UseAudioLevelOptions {
  /** Threshold for considering audio as "active" (0-255). Default: 10 */
  threshold?: number;
  /** Whether audio level detection is enabled. Default: true */
  enabled?: boolean;
}

export interface UseAudioLevelResult {
  /** Whether audio is currently active (above threshold) */
  isActive: boolean;
}

/**
 * Detects audio level from a MediaStream using Web Audio API.
 *
 * @param stream - MediaStream containing audio track
 * @param options - Configuration options
 * @returns Object containing isActive state
 */
export function useAudioLevel(
  stream: MediaStream | null,
  options: UseAudioLevelOptions = {}
): UseAudioLevelResult {
  const { threshold = 10, enabled = true } = options;
  const [isActive, setIsActive] = useState(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!stream || !enabled) {
      setIsActive(false);
      return;
    }

    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      setIsActive(false);
      return;
    }

    // Create audio context and analyser
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;

    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    audioContextRef.current = audioContext;
    analyserRef.current = analyser;
    sourceRef.current = source;

    // Data array for frequency data
    const dataArray = new Uint8Array(analyser.frequencyBinCount);

    // Animation loop to check audio level
    const checkAudioLevel = () => {
      if (!analyserRef.current) return;

      analyserRef.current.getByteFrequencyData(dataArray);

      // Calculate average level
      const sum = dataArray.reduce((acc, val) => acc + val, 0);
      const average = sum / dataArray.length;

      setIsActive(average > threshold);

      animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
    };

    checkAudioLevel();

    // Cleanup
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }

      if (analyserRef.current) {
        analyserRef.current.disconnect();
        analyserRef.current = null;
      }

      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, [stream, enabled, threshold]);

  return { isActive };
}
