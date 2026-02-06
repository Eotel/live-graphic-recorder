import { isValidUUID } from "@/server/domain/common/id";
import { badRequest } from "@/server/presentation/http/errors";

export function requirePathMatch(pathname: string, pattern: RegExp): RegExpMatchArray | Response {
  const match = pathname.match(pattern);
  if (!match) {
    return badRequest();
  }
  return match;
}

export function requireUuidParam(value: string | undefined, label: string): string | Response {
  if (!value || !isValidUUID(value)) {
    return badRequest(`Invalid ${label}`);
  }
  return value;
}

export function requireIntParam(value: string | undefined, label: string): number | Response {
  if (!value || !/^\d+$/.test(value)) {
    return badRequest(`Invalid ${label}`);
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isSafeInteger(parsed)) {
    return badRequest(`Invalid ${label}`);
  }
  return parsed;
}
