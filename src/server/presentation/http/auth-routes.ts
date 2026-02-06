import type { AuthService } from "@/server/application/auth";
import type { PersistenceService } from "@/services/server/persistence";

interface CreateAuthRoutesInput {
  persistence: PersistenceService;
  auth: AuthService;
}

export function createAuthRoutes(input: CreateAuthRoutesInput): Record<string, unknown> {
  return {
    "/api/auth/signup": {
      POST: async (req: Request) => {
        const parsed = await input.auth.parseAuthRequestBody(req);
        if (!parsed) {
          return new Response("Invalid request body", { status: 400 });
        }

        const passwordValidation = input.auth.validatePasswordComplexity(parsed.password);
        if (!passwordValidation.valid) {
          return new Response(passwordValidation.reason ?? "Invalid password", { status: 400 });
        }

        const existing = input.persistence.getUserByEmail(parsed.email);
        if (existing) {
          return new Response("Email already in use", { status: 409 });
        }

        try {
          const passwordHash = await Bun.password.hash(parsed.password);
          const user = input.persistence.createUser(parsed.email, passwordHash);
          input.persistence.claimLegacyMeetingsForUser(user.id);

          const headers = input.auth.issueSessionTokens(req, user.id);
          return new Response(
            JSON.stringify(input.auth.buildAuthUserResponse(user.id, user.email)),
            {
              status: 201,
              headers,
            },
          );
        } catch (error) {
          console.error("[Auth] Failed to sign up:", error);
          return new Response("Failed to create user", { status: 500 });
        }
      },
    },

    "/api/auth/login": {
      POST: async (req: Request) => {
        const parsed = await input.auth.parseAuthRequestBody(req);
        if (!parsed) {
          return new Response("Invalid request body", { status: 400 });
        }

        const user = input.persistence.getUserByEmail(parsed.email);
        if (!user) {
          return new Response("Invalid credentials", { status: 401 });
        }

        const ok = await Bun.password.verify(parsed.password, user.passwordHash);
        if (!ok) {
          return new Response("Invalid credentials", { status: 401 });
        }

        input.persistence.claimLegacyMeetingsForUser(user.id);
        const headers = input.auth.issueSessionTokens(req, user.id);
        return new Response(JSON.stringify(input.auth.buildAuthUserResponse(user.id, user.email)), {
          status: 200,
          headers,
        });
      },
    },

    "/api/auth/refresh": {
      POST: (req: Request) => {
        const cookies = input.auth.parseCookies(req.headers.get("cookie"));
        const refreshToken = cookies[input.auth.refreshTokenCookie];
        if (!refreshToken) {
          const headers = new Headers();
          input.auth.clearAuthCookies(headers, req);
          return new Response("Unauthorized", { status: 401, headers });
        }

        const payload = input.auth.verifyToken(refreshToken, input.auth.authSecret);
        if (!payload || payload.type !== "refresh") {
          const headers = new Headers();
          input.auth.clearAuthCookies(headers, req);
          return new Response("Unauthorized", { status: 401, headers });
        }

        const stored = input.persistence.getActiveRefreshTokenByHash(
          input.auth.hashToken(refreshToken),
        );
        if (!stored || stored.userId !== payload.sub) {
          const headers = new Headers();
          input.auth.clearAuthCookies(headers, req);
          return new Response("Unauthorized", { status: 401, headers });
        }

        input.persistence.revokeRefreshToken(stored.id);
        const user = input.persistence.getUserById(stored.userId);
        if (!user) {
          const headers = new Headers();
          input.auth.clearAuthCookies(headers, req);
          return new Response("Unauthorized", { status: 401, headers });
        }

        const headers = input.auth.issueSessionTokens(req, user.id);
        return new Response(JSON.stringify(input.auth.buildAuthUserResponse(user.id, user.email)), {
          status: 200,
          headers,
        });
      },
    },

    "/api/auth/logout": {
      POST: (req: Request) => {
        const cookies = input.auth.parseCookies(req.headers.get("cookie"));
        const refreshToken = cookies[input.auth.refreshTokenCookie];
        if (refreshToken) {
          const stored = input.persistence.getActiveRefreshTokenByHash(
            input.auth.hashToken(refreshToken),
          );
          if (stored) {
            input.persistence.revokeRefreshToken(stored.id);
          }
        }

        const headers = new Headers({ "Content-Type": "application/json" });
        input.auth.clearAuthCookies(headers, req);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
      },
    },

    "/api/auth/me": {
      GET: (req: Request) => {
        const auth = input.auth.requireAuthenticatedUser(req);
        if (auth instanceof Response) {
          return auth;
        }

        const user = input.persistence.getUserById(auth.userId);
        if (!user) {
          return input.auth.unauthorizedResponse();
        }

        return Response.json(input.auth.buildAuthUserResponse(user.id, user.email));
      },
    },
  };
}
