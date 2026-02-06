import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface LoginPageProps {
  isSubmitting: boolean;
  error: string | null;
  onLogin: (email: string, password: string) => Promise<boolean>;
  onSignup: (email: string, password: string) => Promise<boolean>;
}

export function LoginPage({ isSubmitting, error, onLogin, onSignup }: LoginPageProps) {
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
      setLocalError("有効なメールアドレスを入力してください");
      return;
    }
    if (!password) {
      setLocalError("パスワードを入力してください");
      return;
    }

    const ok = isLogin
      ? await onLogin(normalizedEmail, password)
      : await onSignup(normalizedEmail, password);

    if (!ok && !error) {
      setLocalError(isLogin ? "ログインに失敗しました" : "アカウント作成に失敗しました");
    }
  }

  const displayError = localError ?? error;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">Live Graphic Recorder</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {isLogin ? "ログインして会議一覧を表示します" : "新規アカウントを作成します"}
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="email">
              メールアドレス
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={isSubmitting}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground" htmlFor="password">
              パスワード
            </label>
            <Input
              id="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isLogin ? "パスワード" : "12文字以上・英大小/数字/記号を含む"}
              disabled={isSubmitting}
            />
          </div>

          {displayError && <p className="text-sm text-destructive">{displayError}</p>}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "処理中..." : isLogin ? "ログイン" : "アカウント作成"}
          </Button>
        </form>

        <div className="mt-4 text-sm text-muted-foreground">
          {isLogin ? "アカウント未登録ですか？" : "既にアカウントをお持ちですか？"}
          <button
            type="button"
            className="ml-2 text-foreground underline underline-offset-4"
            onClick={() => {
              setMode(isLogin ? "signup" : "login");
              setLocalError(null);
            }}
            disabled={isSubmitting}
          >
            {isLogin ? "新規登録" : "ログインへ"}
          </button>
        </div>
      </div>
    </div>
  );
}
