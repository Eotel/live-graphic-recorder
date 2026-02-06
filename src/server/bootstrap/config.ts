import { resolve } from "node:path";
import { DB_CONFIG } from "@/config/constants";
import { resolveAuthSecret } from "@/services/server/auth";
import { parseAllowedOrigins } from "@/services/server/ws-origin";

interface RuntimeEnv {
  PORT?: string;
  HOST?: string;
  AUTH_JWT_SECRET?: string;
  NODE_ENV?: string;
  WS_ALLOWED_ORIGINS?: string;
}

export interface ServerRuntimeConfig {
  port: number;
  host: string;
  authSecret: string;
  usesFallbackAuthSecret: boolean;
  wsAllowedOrigins: Set<string>;
  mediaBasePath: string;
}

export function loadServerRuntimeConfig(env: RuntimeEnv = process.env): ServerRuntimeConfig {
  const { secret: authSecret, usesFallback: usesFallbackAuthSecret } = resolveAuthSecret({
    AUTH_JWT_SECRET: env.AUTH_JWT_SECRET,
    NODE_ENV: env.NODE_ENV,
  });

  return {
    port: Number(env.PORT) || 3000,
    host: env.HOST || "127.0.0.1",
    authSecret,
    usesFallbackAuthSecret,
    wsAllowedOrigins: parseAllowedOrigins(env.WS_ALLOWED_ORIGINS),
    mediaBasePath: resolve(DB_CONFIG.defaultMediaPath),
  };
}
