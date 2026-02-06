import { createAuthService, type AuthService } from "@/server/application/auth";
import { createRecordingWebSocketHandlers } from "@/server/presentation/ws/recording-handler";
import type { PersistenceService } from "@/services/server/persistence";
import { PersistenceService as PersistenceServiceImpl } from "@/services/server/persistence";
import type { ServerRuntimeConfig } from "./config";

const ACCESS_TOKEN_TTL_SEC = 15 * 60;
const REFRESH_TOKEN_TTL_SEC = 30 * 24 * 60 * 60;

export interface ServerContainer {
  persistence: PersistenceService;
  auth: AuthService;
  wsHandlers: ReturnType<typeof createRecordingWebSocketHandlers>;
}

export function createServerContainer(config: ServerRuntimeConfig): ServerContainer {
  const persistence = new PersistenceServiceImpl();
  const auth = createAuthService({
    persistence,
    authSecret: config.authSecret,
    accessTokenTtlSec: ACCESS_TOKEN_TTL_SEC,
    refreshTokenTtlSec: REFRESH_TOKEN_TTL_SEC,
  });
  const wsHandlers = createRecordingWebSocketHandlers({ persistence });

  return {
    persistence,
    auth,
    wsHandlers,
  };
}
