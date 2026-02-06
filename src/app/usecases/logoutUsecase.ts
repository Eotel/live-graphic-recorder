export interface LogoutUsecaseDeps {
  isLogoutInProgress: () => boolean;
  setLogoutInProgress: (inProgress: boolean) => void;
  beforeLogout?: () => void;
  performLogout: () => Promise<void>;
  afterLogout?: () => void;
}

export function logoutUsecase(deps: LogoutUsecaseDeps): () => Promise<boolean> {
  return async () => {
    if (deps.isLogoutInProgress()) {
      return false;
    }

    deps.setLogoutInProgress(true);
    try {
      deps.beforeLogout?.();
      await deps.performLogout();
      deps.afterLogout?.();
      return true;
    } finally {
      deps.setLogoutInProgress(false);
    }
  };
}
