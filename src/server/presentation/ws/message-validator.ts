export interface ParsedWsMessage {
  type: string;
  data?: unknown;
}

/**
 * Parse a WebSocket message payload into a minimal structured object.
 * Returns null when JSON is invalid or the payload shape is unsupported.
 */
export function parseWsMessage(raw: string): ParsedWsMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const maybeType = (parsed as { type?: unknown }).type;
    if (typeof maybeType !== "string") {
      return null;
    }

    const maybeData = "data" in parsed ? (parsed as { data?: unknown }).data : undefined;
    if (typeof maybeData === "undefined") {
      return { type: maybeType };
    }
    return { type: maybeType, data: maybeData };
  } catch {
    return null;
  }
}
