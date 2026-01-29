/**
 * Time formatting utility for elapsed time display.
 *
 * Related: src/hooks/useElapsedTime.ts
 */

/**
 * Formats elapsed seconds into a human-readable time string.
 *
 * @param seconds - The number of elapsed seconds (non-negative)
 * @returns Formatted time string in MM:SS or HH:MM:SS format
 *
 * @example
 * formatElapsedTime(0)    // "00:00"
 * formatElapsedTime(125)  // "02:05"
 * formatElapsedTime(3725) // "01:02:05"
 */
export function formatElapsedTime(seconds: number): string {
  // Treat negative values as 0
  const normalizedSeconds = Math.max(0, Math.floor(seconds));

  const hours = Math.floor(normalizedSeconds / 3600);
  const minutes = Math.floor((normalizedSeconds % 3600) / 60);
  const secs = normalizedSeconds % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");

  if (hours > 0) {
    return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
  }
  return `${pad(minutes)}:${pad(secs)}`;
}
