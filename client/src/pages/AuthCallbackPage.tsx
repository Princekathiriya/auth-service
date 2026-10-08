import { Navigate } from 'react-router';
import { useAuth } from '../auth/useAuth';

/**
 * Google login lands here. The API already set the refresh cookie, and AuthProvider calls
 * /auth/refresh on every page load, so all this page does is wait for the result.
 * (No token in the URL to read: the API deliberately never puts one there.)
 */
export function AuthCallbackPage() {
  const { state } = useAuth();
  if (state.status === 'loading') return <p className="muted center">Signing you in…</p>;
  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  return <Navigate to="/login?error=OAUTH_FAILED" replace />;
}
