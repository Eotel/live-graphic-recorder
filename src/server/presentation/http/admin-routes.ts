import type { AuthService } from "@/server/application/auth";
import { badRequest, notFound } from "@/server/presentation/http/errors";
import { requireStaffOrAdmin } from "@/server/presentation/http/guards";
import { requirePathMatch } from "@/server/presentation/http/params";
import type { PersistenceService } from "@/services/server/persistence";
import type { SessionStatus } from "@/types/messages";

interface CreateAdminRoutesInput {
  persistence: PersistenceService;
  auth: AuthService;
}

const ADMIN_SESSION_DETAIL_PATH_PATTERN = /^\/api\/admin\/sessions\/([^/]+)$/;
const VALID_SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const VALID_SESSION_STATUSES = new Set<SessionStatus>(["idle", "recording", "processing", "error"]);
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function parseOptionalInt(
  value: string | null,
  label: string,
  { min, max }: { min: number; max?: number },
): number | undefined | Response {
  if (!value) {
    return undefined;
  }
  if (!/^\d+$/.test(value)) {
    return badRequest(`Invalid ${label}`);
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed) || parsed < min || (typeof max === "number" && parsed > max)) {
    return badRequest(`Invalid ${label}`);
  }
  return parsed;
}

function parseOptionalStatus(value: string | null): SessionStatus | undefined | Response {
  if (!value || value === "all") {
    return undefined;
  }
  if (!VALID_SESSION_STATUSES.has(value as SessionStatus)) {
    return badRequest("Invalid status");
  }
  return value as SessionStatus;
}

export function createAdminRoutes(input: CreateAdminRoutesInput): Record<string, unknown> {
  return {
    "/api/admin/sessions": {
      GET: async (req: Request) => {
        const authResult = requireStaffOrAdmin(input.auth, input.persistence, req);
        if (authResult instanceof Response) {
          return authResult;
        }

        const url = new URL(req.url);
        const status = parseOptionalStatus(url.searchParams.get("status"));
        if (status instanceof Response) {
          return status;
        }

        const fromTimestamp = parseOptionalInt(url.searchParams.get("from"), "from", { min: 0 });
        if (fromTimestamp instanceof Response) {
          return fromTimestamp;
        }

        const toTimestamp = parseOptionalInt(url.searchParams.get("to"), "to", { min: 0 });
        if (toTimestamp instanceof Response) {
          return toTimestamp;
        }

        const limit =
          parseOptionalInt(url.searchParams.get("limit"), "limit", { min: 1, max: MAX_LIMIT }) ??
          DEFAULT_LIMIT;
        if (limit instanceof Response) {
          return limit;
        }

        const offset = parseOptionalInt(url.searchParams.get("offset"), "offset", { min: 0 }) ?? 0;
        if (offset instanceof Response) {
          return offset;
        }

        const result = input.persistence.listAdminSessions({
          q: url.searchParams.get("q")?.trim() || undefined,
          status,
          fromTimestamp,
          toTimestamp,
          limit,
          offset,
        });

        return Response.json({
          sessions: result.items,
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        });
      },
    },

    "/api/admin/sessions/:sessionId": async (req: Request) => {
      const authResult = requireStaffOrAdmin(input.auth, input.persistence, req);
      if (authResult instanceof Response) {
        return authResult;
      }

      const url = new URL(req.url);
      const match = requirePathMatch(url.pathname, ADMIN_SESSION_DETAIL_PATH_PATTERN);
      if (match instanceof Response) {
        return match;
      }

      const sessionId = match[1];
      if (!sessionId || !VALID_SESSION_ID_PATTERN.test(sessionId)) {
        return badRequest("Invalid session ID");
      }

      const detail = input.persistence.getAdminSessionDetail(sessionId);
      if (!detail) {
        return notFound("Session not found");
      }

      return Response.json({ session: detail });
    },
  };
}
