import type { AuthService } from "@/server/application/auth";
import type { AuthUser } from "@/server/types/context";
import type { PersistenceService } from "@/services/server/persistence";
import { forbidden, notFound } from "@/server/presentation/http/errors";
import { isStaffOrAdminRole } from "@/types/auth";

export function requireAuthUser(auth: AuthService, req: Request): AuthUser | Response {
  return auth.requireAuthenticatedUser(req);
}

export function requireOwnedMeeting(
  persistence: PersistenceService,
  meetingId: string,
  userId?: string,
): NonNullable<ReturnType<PersistenceService["getMeeting"]>> | Response {
  const meeting = persistence.getMeeting(meetingId, userId);
  if (!meeting) {
    return notFound("Meeting not found");
  }
  return meeting;
}

export function resolveMeetingReadOwnerUserId(
  persistence: PersistenceService,
  userId: string,
): string | undefined {
  const user = persistence.getUserById(userId);
  if (user?.role === "admin") {
    return undefined;
  }
  return userId;
}

export function requireStaffOrAdmin(
  auth: AuthService,
  persistence: PersistenceService,
  req: Request,
):
  | { authUser: AuthUser; user: NonNullable<ReturnType<PersistenceService["getUserById"]>> }
  | Response {
  const authUser = requireAuthUser(auth, req);
  if (authUser instanceof Response) {
    return authUser;
  }

  const user = persistence.getUserById(authUser.userId);
  if (!user) {
    return auth.unauthorizedResponse();
  }

  if (!isStaffOrAdminRole(user.role)) {
    return forbidden("Admin permission required");
  }

  return { authUser, user };
}
