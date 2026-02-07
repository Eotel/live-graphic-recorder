const DAY_MS = 24 * 60 * 60 * 1000;

export function normalizeTimestamp(timestamp: number): number {
  // Heuristic: treat 10-digit epoch as seconds.
  if (timestamp > 0 && timestamp < 1_000_000_000_000) {
    return timestamp * 1000;
  }
  return timestamp;
}

function getStartOfDayMs(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function formatRelativeMeetingDate(
  timestamp: number | null | undefined,
  locale: string | undefined,
  unknownLabel: string,
): string {
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return unknownLabel;
  }

  const normalized = normalizeTimestamp(timestamp);
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) {
    return unknownLabel;
  }

  const now = new Date();
  const diffMs = now.getTime() - normalized;
  const diffDays = Math.floor((getStartOfDayMs(now) - getStartOfDayMs(date)) / DAY_MS);

  const dateFormatter = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" });
  if (diffMs < 0 || diffDays < 0) {
    return dateFormatter.format(date);
  }

  const relativeDayFormatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (diffDays === 0 || diffDays === 1) {
    const dayLabel = relativeDayFormatter.format(-diffDays, "day");
    const timeLabel = new Intl.DateTimeFormat(locale, {
      hour: "2-digit",
      minute: "2-digit",
    }).format(date);
    return `${dayLabel} ${timeLabel}`;
  }

  if (diffDays < 7) {
    return relativeDayFormatter.format(-diffDays, "day");
  }

  return dateFormatter.format(date);
}
