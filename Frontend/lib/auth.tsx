"use client";
/**
 * lib/auth.ts — Auth state context + provider.
 * Wraps the entire app. Use useAuth() in any client component.
 */
import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { authApi, tokenStore, type User } from "./api";
import { useRouter } from "next/navigation";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; first_name: string; last_name: string; role: string }) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Rehydrate user from stored token on mount
  useEffect(() => {
    const token = tokenStore.getAccess();
    if (!token) { setLoading(false); return; }
    authApi.me()
      .then(setUser)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await authApi.login(email, password);
    tokenStore.set(res.access_token, res.refresh_token);
    setUser(res.user);
    // Route by role
    const dest = res.user.role === "admin" ? "/admin/dashboard"
      : res.user.role === "dentist" ? "/dentist/dashboard"
      : "/patient/dashboard";
    router.push(dest);
  }, [router]);

  const register = useCallback(async (data: Parameters<typeof authApi.register>[0]) => {
    const res = await authApi.register(data);
    tokenStore.set(res.access_token, res.refresh_token);
    const me = await authApi.me();
    setUser(me);
    router.push(`/${me.role}/dashboard`);
  }, [router]);

  const logout = useCallback(async () => {
    const refresh = tokenStore.getRefresh();
    if (refresh) authApi.logout(refresh).catch(() => {});
    tokenStore.clear();
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Route guard hook — redirects unauthenticated users */
export function useRequireAuth(requiredRole?: string) {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) { router.replace("/login"); return; }
    if (!loading && user && requiredRole && user.role !== requiredRole) {
      router.replace(`/${user.role}/dashboard`);
    }
  }, [user, loading, requiredRole, router]);
  return { user, loading };
}
