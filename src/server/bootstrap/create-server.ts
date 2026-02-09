import { type Server } from "bun";
import { loadServerRuntimeConfig } from "@/server/bootstrap/config";
import { createServerContainer } from "@/server/bootstrap/container";
import { generateSessionId } from "@/server/domain/common/id";
import { createAdminRoutes } from "@/server/presentation/http/admin-routes";
import { createAuthRoutes } from "@/server/presentation/http/auth-routes";
import { createMeetingRoutes } from "@/server/presentation/http/meeting-routes";
import { createWsContext } from "@/server/presentation/ws/context";
import type { WSContext } from "@/server/types/context";
import { validateWebSocketOrigin } from "@/services/server/ws-origin";
import index from "../../index.html";

export function createServer(): Server<WSContext> {
  const config = loadServerRuntimeConfig();

  if (config.usesFallbackAuthSecret) {
    console.warn(
      "[Auth] AUTH_JWT_SECRET is not set. Using an insecure development fallback secret.",
    );
  }

  const container = createServerContainer(config);

  return Bun.serve<WSContext>({
    port: config.port,
    hostname: config.host,
    routes: {
      "/": index,
      "/api/health": {
        GET: () => Response.json({ status: "ok", timestamp: Date.now() }),
      },
      ...createAuthRoutes({
        persistence: container.persistence,
        auth: container.auth,
      }),
      ...createMeetingRoutes({
        persistence: container.persistence,
        auth: container.auth,
        mediaBasePath: config.mediaBasePath,
      }),
      ...createAdminRoutes({
        persistence: container.persistence,
        auth: container.auth,
      }),
      "/ws/recording": (req: Request, server: Server<WSContext>) => {
        const originValidationResult = validateWebSocketOrigin(req, config.wsAllowedOrigins);
        if (!originValidationResult.ok) {
          console.warn(
            `[WS] Rejected upgrade by Origin validation (${originValidationResult.reason}): origin=${req.headers.get("origin") ?? "(missing)"}, url=${req.url}`,
          );
          return new Response("Forbidden", { status: 403 });
        }

        const authUser = container.auth.requireAuthenticatedUser(req);
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
      open: container.wsHandlers.open,
      message: container.wsHandlers.message,
      close: container.wsHandlers.close,
    },

    development: process.env["NODE_ENV"] !== "production" && {
      hmr: true,
      console: true,
    },
  });
}
