/**
 * Sanitize error message for client consumption.
 * Avoids leaking internal details like file paths, stack traces, or API keys.
 */
export function sanitizeErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return "An unexpected error occurred";
  }
  const msg = error.message;
  if (
    msg.includes("/") ||
    msg.includes("\\") ||
    msg.includes("ENOENT") ||
    msg.includes("EACCES") ||
    msg.includes("api_key") ||
    msg.includes("API key")
  ) {
    return "An internal error occurred";
  }

  return msg.length > 200 ? `${msg.slice(0, 200)}...` : msg;
}
