export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export function shouldAutoConnect(
  authStatus: AuthStatus,
  isConnected: boolean,
  isLogoutInProgress: boolean,
): boolean {
  return authStatus === "authenticated" && !isConnected && !isLogoutInProgress;
}
