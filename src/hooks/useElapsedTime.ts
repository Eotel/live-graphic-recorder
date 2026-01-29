/**
 * Hook for tracking elapsed time during recording.
 *
 * Design doc: plans/live-graphic-recorder-plan.md
 * Related: src/lib/formatTime.ts, src/components/recording/CameraPreview.tsx
 */

import { useState, useEffect, useRef } from "react";
import { formatElapsedTime } from "@/lib/formatTime";

export interface UseElapsedTimeOptions {
  /** Whether time tracking is enabled (default: false) */
  enabled?: boolean;
  /** Update interval in milliseconds (default: 1000) */
  intervalMs?: number;
}

export interface UseElapsedTimeResult {
  /** Current elapsed time in seconds */
  elapsedSeconds: number;
  /** Formatted elapsed time string (MM:SS or HH:MM:SS) */
  formattedTime: string;
}

/**
 * Tracks elapsed time with Date.now() for accuracy.
 *
 * Time is reset to 0 when disabled, and restarts from 0 when re-enabled.
 *
 * @example
 * const { formattedTime } = useElapsedTime({ enabled: isRecording });
 * // formattedTime = "02:45"
 */
export function useElapsedTime(options: UseElapsedTimeOptions = {}): UseElapsedTimeResult {
  const { enabled = false, intervalMs = 1000 } = options;
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (enabled) {
      startTimeRef.current = Date.now();
      setElapsedSeconds(0);

      intervalRef.current = setInterval(() => {
        if (startTimeRef.current !== null) {
          const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
          setElapsedSeconds(elapsed);
        }
      }, intervalMs);
    } else {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      startTimeRef.current = null;
      setElapsedSeconds(0);
    }

    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalMs]);

  return {
    elapsedSeconds,
    formattedTime: formatElapsedTime(elapsedSeconds),
  };
}
