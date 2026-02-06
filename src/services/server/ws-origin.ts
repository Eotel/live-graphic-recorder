/**
 * WebSocket Origin validation utilities to mitigate CSWSH.
 */

const HTTP_PROTOCOL = "http:";
const HTTPS_PROTOCOL = "https:";
const MAX_PORT = 65535;

type InvalidReason = "missing_origin" | "invalid_origin" | "origin_mismatch";

export type WebSocketOriginValidationResult = { ok: true } | { ok: false; reason: InvalidReason };

function firstHeaderValue(value: string | null): string | null {
  if (!value) return null;
  const first = value.split(",")[0]?.trim();
  return first && first.length > 0 ? first : null;
}

function isAllowedProtocol(protocol: string): boolean {
  return protocol === HTTP_PROTOCOL || protocol === HTTPS_PROTOCOL;
}

function normalizeOrigin(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  if (!isAllowedProtocol(parsed.protocol)) {
    return null;
  }

  return parsed.origin;
}

function parseForwardedOrigin(req: Request): string | null {
  const proto = firstHeaderValue(req.headers.get("x-forwarded-proto"));
  const host = firstHeaderValue(req.headers.get("x-forwarded-host"));
  const port = firstHeaderValue(req.headers.get("x-forwarded-port"));

  if (!proto || !host) {
    return null;
  }

  const normalizedProto = proto.toLowerCase();
  if (!isAllowedProtocol(`${normalizedProto}:`)) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(`${normalizedProto}://${host}`);
  } catch {
    return null;
  }

  if (port) {
    if (!/^\d+$/.test(port)) {
      return null;
    }
    const portNum = Number(port);
    if (!Number.isInteger(portNum) || portNum <= 0 || portNum > MAX_PORT) {
      return null;
    }
    if (parsed.port === "") {
      parsed.port = String(portNum);
    }
  }

  return parsed.origin;
}

export function parseAllowedOrigins(raw: string | undefined): Set<string> {
  const allowed = new Set<string>();
  if (!raw) {
    return allowed;
  }

  for (const value of raw.split(",")) {
    const candidate = value.trim();
    if (!candidate) continue;

    const normalized = normalizeOrigin(candidate);
    if (normalized) {
      allowed.add(normalized);
    }
  }

  return allowed;
}

export function buildExpectedOrigins(req: Request): Set<string> {
  const expected = new Set<string>();

  const requestOrigin = normalizeOrigin(req.url);
  if (requestOrigin) {
    expected.add(requestOrigin);
  }

  const forwardedOrigin = parseForwardedOrigin(req);
  if (forwardedOrigin) {
    expected.add(forwardedOrigin);
  }

  return expected;
}

export function validateWebSocketOrigin(
  req: Request,
  allowedOrigins: ReadonlySet<string>,
): WebSocketOriginValidationResult {
  const originHeader = req.headers.get("origin");
  if (!originHeader) {
    return { ok: false, reason: "missing_origin" };
  }

  const incomingOrigin = normalizeOrigin(originHeader);
  if (!incomingOrigin) {
    return { ok: false, reason: "invalid_origin" };
  }

  const expectedOrigins = buildExpectedOrigins(req);
  for (const allowed of allowedOrigins) {
    expectedOrigins.add(allowed);
  }

  if (expectedOrigins.has(incomingOrigin)) {
    return { ok: true };
  }

  return { ok: false, reason: "origin_mismatch" };
}
