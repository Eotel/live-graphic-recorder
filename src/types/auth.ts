export const USER_ROLES = ["user", "staff", "admin"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && USER_ROLES.includes(value as UserRole);
}

export function isStaffOrAdminRole(role: UserRole): boolean {
  return role === "staff" || role === "admin";
}
