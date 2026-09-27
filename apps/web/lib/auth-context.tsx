"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type {
  AuthUserDTO,
  LoginChallengeResponseDTO,
  LoginRequestDTO,
  LoginResponseDTO,
  RegisterRequestDTO,
} from "@insurance/shared";
import { apiFetch } from "./api";

interface AuthContextValue {
  user: AuthUserDTO | null;
  accessToken: string | null;
  loading: boolean;
  login: (input: LoginRequestDTO) => Promise<LoginResponseDTO | LoginChallengeResponseDTO>;
  completeTwoFactor: (challengeToken: string, code: string) => Promise<LoginResponseDTO>;
  register: (input: RegisterRequestDTO) => Promise<LoginResponseDTO>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUserDTO | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // React StrictMode double-invokes this effect in dev, which would
    // otherwise fire two concurrent refresh calls and let whichever one
    // resolves last (often the failing duplicate) clobber real session
    // state. Ignore the result of a run that's been superseded.
    let cancelled = false;

    apiFetch<LoginResponseDTO>("/api/auth/refresh", { method: "POST" })
      .then((res) => {
        if (cancelled) return;
        setAccessToken(res.accessToken);
        setUser(res.user);
      })
      .catch(() => {
        if (cancelled) return;
        setAccessToken(null);
        setUser(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: LoginRequestDTO) => {
    const res = await apiFetch<LoginResponseDTO | LoginChallengeResponseDTO>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
    if (res.status === "ok") {
      setAccessToken(res.accessToken);
      setUser(res.user);
    }
    return res;
  }, []);

  const completeTwoFactor = useCallback(async (challengeToken: string, code: string) => {
    const res = await apiFetch<LoginResponseDTO>("/api/auth/2fa/verify", {
      method: "POST",
      body: JSON.stringify({ challengeToken, code }),
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
    return res;
  }, []);

  const register = useCallback(async (input: RegisterRequestDTO) => {
    const res = await apiFetch<LoginResponseDTO>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(input),
    });
    setAccessToken(res.accessToken);
    setUser(res.user);
    return res;
  }, []);

  const logout = useCallback(async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, accessToken, loading, login, completeTwoFactor, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
