import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, refreshSession, setSessionExpiredHandler } from '../lib/api';
import type { User } from '../lib/types';

export type AuthState =
  | { status: 'loading' } // checking the refresh cookie on startup
  | { status: 'anonymous' }
  | { status: 'authenticated'; user: User };

export interface AuthContextValue {
  state: AuthState;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
  logoutAll(): Promise<void>;
  setUser(user: User): void;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const setUser = useCallback((user: User) => setState({ status: 'authenticated', user }), []);

  useEffect(() => {
    // Restore the session after a page reload: the access token is gone (memory only),
    // but the httpOnly refresh cookie is still there. React StrictMode runs this effect
    // twice in dev; refreshSession() de-duplicates, so only one request goes out.
    refreshSession()
      .then((r) => setUser(r.user))
      .catch(() => setState({ status: 'anonymous' }));

    setSessionExpiredHandler(() => setState({ status: 'anonymous' }));
    return () => setSessionExpiredHandler(null);
  }, [setUser]);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      setUser,
      login: async (email, password) => setUser(await authApi.login(email, password)),
      register: async (name, email, password) => setUser(await authApi.register(name, email, password)),
      logout: async () => {
        await authApi.logout().catch(() => undefined); // log out locally even if the server is unreachable
        setState({ status: 'anonymous' });
      },
      logoutAll: async () => {
        await authApi.logoutAll();
        setState({ status: 'anonymous' });
      },
    }),
    [state, setUser],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}
