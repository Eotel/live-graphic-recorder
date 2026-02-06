import { resolve } from "node:path";
import { type Server } from "bun";
import { DB_CONFIG } from "@/config/constants";
import { createAuthService } from "@/server/application/auth";
import { generateSessionId } from "@/server/domain/common/id";
import { createAuthRoutes } from "@/server/presentation/http/auth-routes";
import { createMeetingRoutes } from "@/server/presentation/http/meeting-routes";
import { createWsContext } from "@/server/presentation/ws/context";
import { createRecordingWebSocketHandlers } from "@/server/presentation/ws/recording-handler";
import type { WSContext } from "@/server/types/context";
import { resolveAuthSecret } from "@/services/server/auth";
import { PersistenceService } from "@/services/server/persistence";
import { parseAllowedOrigins, validateWebSocketOrigin } from "@/services/server/ws-origin";
import index from "../../index.html";

const ACCESS_TOKEN_TTL_SEC = 15 * 60;
const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

export function createServer(): Server<WSContext> {
  const persistence = new PersistenceService();

  const port = Number(process.env["PORT"]) || 3000;
  const host = process.env["HOST"] || "127.0.0.1";
  const wsAllowedOrigins = parseAllowedOrigins(process.env["WS_ALLOWED_ORIGINS"]);
  const mediaBasePath = resolve(DB_CONFIG.defaultMediaPath);

  const { secret: authSecret, usesFallback: isUsingFallbackAuthSecret } = resolveAuthSecret({
    AUTH_JWT_SECRET: process.env["AUTH_JWT_SECRET"],
    NODE_ENV: process.env["NODE_ENV"],
  });

  if (isUsingFallbackAuthSecret) {
    console.warn(
      "[Auth] AUTH_JWT_SECRET is not set. Using an insecure development fallback secret.",
    );
  }

  const auth = createAuthService({
    persistence,
    authSecret,
    accessTokenTtlSec: ACCESS_TOKEN_TTL_SEC,
    refreshTokenTtlSec: REFRESH_TOKEN_TTL_SEC,
  });
  const wsHandlers = createRecordingWebSocketHandlers({ persistence });

  return Bun.serve<WSContext>({
    port,
    hostname: host,
    routes: {
      "/": index,
      "/api/health": {
        GET: () => Response.json({ status: "ok", timestamp: Date.now() }),
      },
      ...createAuthRoutes({ persistence, auth }),
      ...createMeetingRoutes({
        persistence,
        auth,
        mediaBasePath,
      }),
      "/ws/recording": (req: Request, server: Server<WSContext>) => {
        const originValidationResult = validateWebSocketOrigin(req, wsAllowedOrigins);
        if (!originValidationResult.ok) {
          console.warn(
            `[WS] Rejected upgrade by Origin validation (${originValidationResult.reason}): origin=${req.headers.get("origin") ?? "(missing)"}, url=${req.url}`,
          );
          return new Response("Forbidden", { status: 403 });
        }

        const authUser = auth.requireAuthenticatedUser(req);
        if (authUser instanceof Response) {
          return authUser;
        }

        const sessionId = generateSessionId();
        const success = server.upgrade(req, {
          data: createWsContext(authUser.userId, sessionId),
        });
        if (success) {
          return undefined;
        }

        return new Response("WebSocket upgrade failed", { status: 500 });
      },
      "/*": index,
    },

    websocket: {
      open: wsHandlers.open,
      message: wsHandlers.message,
      close: wsHandlers.close,
    },

    development: process.env["NODE_ENV"] !== "production" && {
      hmr: true,
      console: true,
    },
  });
}
