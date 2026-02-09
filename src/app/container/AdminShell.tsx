import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { LanguageToggle } from "@/components/navigation/LanguageToggle";
import { LoginPage } from "@/components/pages/LoginPage";
import { AdminPage } from "@/components/pages/AdminPage";
import { useAuth } from "@/hooks/useAuth";
import { isStaffOrAdminRole } from "@/types/auth";

export function AdminShell() {
  const { t } = useTranslation();
  const auth = useAuth();

  const onBackToApp = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.location.href = "/";
  }, []);

  if (auth.status === "loading") {
    return (
      <div className="relative min-h-screen bg-background">
        <div className="absolute right-4 top-4 z-20">
          <LanguageToggle />
        </div>
        <div className="min-h-screen flex items-center justify-center text-muted-foreground">
          {t("auth.checkingStatus")}
        </div>
      </div>
    );
  }

  if (auth.status !== "authenticated") {
    return (
      <div className="relative">
        <div className="absolute right-4 top-4 z-20">
          <LanguageToggle />
        </div>
        <LoginPage
          isSubmitting={auth.isSubmitting}
          error={auth.error}
          onLogin={auth.login}
          onSignup={auth.signup}
        />
      </div>
    );
  }

  const authenticatedUser = auth.user;
  if (!authenticatedUser) {
    return (
      <div className="relative min-h-screen bg-background">
        <div className="absolute right-4 top-4 z-20">
          <LanguageToggle />
        </div>
        <div className="min-h-screen flex items-center justify-center text-muted-foreground">
          {t("auth.checkingStatus")}
        </div>
      </div>
    );
  }

  if (!isStaffOrAdminRole(authenticatedUser.role)) {
    return (
      <div className="relative min-h-screen bg-background">
        <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
          <LanguageToggle />
          <Button variant="outline" size="sm" type="button" onClick={onBackToApp}>
            {t("admin.backToApp")}
          </Button>
          <Button variant="outline" size="sm" type="button" onClick={() => void auth.logout()}>
            {t("common.logout")}
          </Button>
        </div>
        <div className="mx-auto flex min-h-screen w-full max-w-xl items-center justify-center px-6">
          <div className="rounded-lg border border-border bg-card p-8 text-center shadow-sm">
            <h1 className="text-xl font-semibold text-foreground">
              {t("admin.accessDeniedTitle")}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("admin.accessDeniedDescription")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminPage
      userEmail={authenticatedUser.email}
      userRole={authenticatedUser.role}
      isSubmitting={auth.isSubmitting}
      onBackToApp={onBackToApp}
      onLogout={auth.logout}
    />
  );
}

export default AdminShell;
