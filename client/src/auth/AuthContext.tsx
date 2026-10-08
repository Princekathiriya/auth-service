import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { authApi, clearSession, refreshSession, setSessionExpiredHandler } from '../lib/api';
import type { User } from '../lib/types';
import { AuthContext, type AuthContextValue, type AuthState } from './context';

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
      forgetSession: () => {
        clearSession();
        setState({ status: 'anonymous' });
      },
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
