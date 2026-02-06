import type { AuthService } from "@/server/application/auth";
import type { AuthUser } from "@/server/types/context";
import type { PersistenceService } from "@/services/server/persistence";
import { notFound } from "@/server/presentation/http/errors";

export function requireAuthUser(auth: AuthService, req: Request): AuthUser | Response {
  return auth.requireAuthenticatedUser(req);
}

export function requireOwnedMeeting(
  persistence: PersistenceService,
  meetingId: string,
  userId: string,
): NonNullable<ReturnType<PersistenceService["getMeeting"]>> | Response {
  const meeting = persistence.getMeeting(meetingId, userId);
  if (!meeting) {
    return notFound("Meeting not found");
  }
  return meeting;
}
