import { useCallback, useEffect, useState } from "react";

export interface AuthUser {
  id: string;
  email: string;
}

export interface UseAuthReturn {
  status: "loading" | "authenticated" | "unauthenticated";
  user: AuthUser | null;
  error: string | null;
  isSubmitting: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refresh: () => Promise<boolean>;
}

interface AuthApiResponse {
  user: AuthUser;
}

async function parseErrorMessage(response: Response): Promise<string> {
  const text = await response.text();
  return text || `${response.status} ${response.statusText}`;
}

async function postAuth(path: string, body?: Record<string, unknown>): Promise<Response> {
  return fetch(path, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function useAuth(): UseAuthReturn {
  const [status, setStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadMe = useCallback(async (): Promise<boolean> => {
    const requestMe = async (): Promise<AuthUser | null> => {
      try {
        const response = await fetch("/api/auth/me", {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok) {
          return null;
        }

        const data = (await response.json()) as AuthApiResponse;
        return data.user;
      } catch {
        return null;
      }
    };

    const authenticate = (authenticatedUser: AuthUser): true => {
      setUser(authenticatedUser);
      setStatus("authenticated");
      setError(null);
      return true;
    };

    const unauthenticated = (): false => {
      setUser(null);
      setStatus("unauthenticated");
      return false;
    };

    const meUser = await requestMe();
    if (meUser) {
      return authenticate(meUser);
    }

    try {
      const refreshResponse = await postAuth("/api/auth/refresh");
      if (!refreshResponse.ok) {
        return unauthenticated();
      }
    } catch {
      return unauthenticated();
    }

    const retryMeUser = await requestMe();
    if (!retryMeUser) {
      return unauthenticated();
    }

    return authenticate(retryMeUser);
  }, []);

  useEffect(() => {
    void loadMe();
  }, [loadMe]);

  const login = useCallback(async (email: string, password: string): Promise<boolean> => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await postAuth("/api/auth/login", { email, password });
      if (!response.ok) {
        setStatus("unauthenticated");
        setUser(null);
        setError(await parseErrorMessage(response));
        return false;
      }

      const data = (await response.json()) as AuthApiResponse;
      setUser(data.user);
      setStatus("authenticated");
      return true;
    } catch {
      setStatus("unauthenticated");
      setUser(null);
      setError("Login failed");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const signup = useCallback(async (email: string, password: string): Promise<boolean> => {
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await postAuth("/api/auth/signup", { email, password });
      if (!response.ok) {
        setStatus("unauthenticated");
        setUser(null);
        setError(await parseErrorMessage(response));
        return false;
      }

      const data = (await response.json()) as AuthApiResponse;
      setUser(data.user);
      setStatus("authenticated");
      return true;
    } catch {
      setStatus("unauthenticated");
      setUser(null);
      setError("Signup failed");
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, []);

  const refresh = useCallback(async (): Promise<boolean> => {
    try {
      const response = await postAuth("/api/auth/refresh");
      if (!response.ok) {
        setStatus("unauthenticated");
        setUser(null);
        return false;
      }

      const data = (await response.json()) as AuthApiResponse;
      setUser(data.user);
      setStatus("authenticated");
      setError(null);
      return true;
    } catch {
      setStatus("unauthenticated");
      setUser(null);
      return false;
    }
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    setIsSubmitting(true);
    setError(null);

    try {
      await postAuth("/api/auth/logout");
    } catch {
      // ignore network failure and clear local state regardless
    } finally {
      setUser(null);
      setStatus("unauthenticated");
      setIsSubmitting(false);
    }
  }, []);

  return {
    status,
    user,
    error,
    isSubmitting,
    login,
    signup,
    logout,
    refresh,
  };
}
