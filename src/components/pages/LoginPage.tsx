import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTranslation } from "react-i18next";

export interface LoginPageProps {
  isSubmitting: boolean;
  error: string | null;
  onLogin: (email: string, password: string) => Promise<boolean>;
  onSignup: (email: string, password: string) => Promise<boolean>;
}

export function LoginPage({ isSubmitting, error, onLogin, onSignup }: LoginPageProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const isLogin = mode === "login";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setLocalError(t("auth.invalidEmail"));
      return;
    }
    if (!password) {
      setLocalError(t("auth.passwordRequired"));
      return;
    }

    const ok = isLogin
      ? await onLogin(normalizedEmail, password)
      : await onSignup(normalizedEmail, password);

    if (!ok && !error) {
      setLocalError(isLogin ? t("auth.loginFailed") : t("auth.signupFailed"));
    }
  }

  const displayError = localError ?? error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">{t("common.appName")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isLogin ? t("auth.loginDescription") : t("auth.signupDescription")}
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="email">
              {t("auth.emailLabel")}
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="password">
              {t("auth.passwordLabel")}
            </label>
            <Input
              id="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={
                isLogin ? t("auth.passwordPlaceholderLogin") : t("auth.passwordPlaceholderSignup")
              }
              disabled={isSubmitting}
            />
          </div>

          {displayError && <p className="text-sm text-destructive">{displayError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? t("auth.submitting") : isLogin ? t("auth.login") : t("auth.signup")}
          </Button>
        </form>

        <div className="mt-4 text-sm text-muted-foreground">
          {isLogin ? t("auth.noAccount") : t("auth.hasAccount")}
          <button
            type="button"
            className="ml-2 text-foreground underline underline-offset-4"
            onClick={() => {
              setMode(isLogin ? "signup" : "login");
              setLocalError(null);
            }}
            disabled={isSubmitting}
          >
            {isLogin ? t("auth.goSignup") : t("auth.goLogin")}
          </button>
        </div>
      </div>
    </div>
  );
}
