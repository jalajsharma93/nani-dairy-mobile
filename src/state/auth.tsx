import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AuthApi, AuthUserResponse, setApiAuthToken, UserRole } from "@/src/services/api";
import { clearPersistedSession, readPersistedSession, writePersistedSession } from "@/src/utils/session-storage";

type AuthContextValue = {
  user: AuthUserResponse | null;
  token: string | null;
  loading: boolean;
  loginLoading: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  refreshMe: () => Promise<void>;
  signOut: () => void;
  hasAnyRole: (...roles: UserRole[]) => boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);

  useEffect(() => {
    let active = true;

    const bootstrapSession = async () => {
      try {
        const persisted = await readPersistedSession();
        if (!persisted?.token) {
          return;
        }
        setApiAuthToken(persisted.token);
        const me = await AuthApi.me();
        if (!active) {
          return;
        }
        setToken(persisted.token);
        setUser(me);
      } catch {
        setApiAuthToken(null);
        if (active) {
          setToken(null);
          setUser(null);
        }
        await clearPersistedSession();
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void bootstrapSession();
    return () => {
      active = false;
    };
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    setLoginLoading(true);
    try {
      const res = await AuthApi.login({ username, password });
      setToken(res.token);
      setUser(res.user);
      setApiAuthToken(res.token);
      await writePersistedSession({ token: res.token });
    } catch (error) {
      setApiAuthToken(null);
      setToken(null);
      setUser(null);
      await clearPersistedSession();
      throw error;
    } finally {
      setLoginLoading(false);
    }
  }, []);

  const refreshMe = useCallback(async () => {
    if (!token) {
      return;
    }
    setApiAuthToken(token);
    try {
      const me = await AuthApi.me();
      setUser(me);
    } catch (error) {
      setApiAuthToken(null);
      setToken(null);
      setUser(null);
      await clearPersistedSession();
      throw error;
    }
  }, [token]);

  const signOut = useCallback(() => {
    setApiAuthToken(null);
    setToken(null);
    setUser(null);
    void clearPersistedSession();
  }, []);

  const hasAnyRole = useCallback(
    (...roles: UserRole[]) => {
      if (!user) {
        return false;
      }
      return roles.includes(user.role);
    },
    [user]
  );

  const value = useMemo<AuthContextValue>(
    () => ({ user, token, loading, loginLoading, signIn, refreshMe, signOut, hasAnyRole }),
    [user, token, loading, loginLoading, signIn, refreshMe, signOut, hasAnyRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
