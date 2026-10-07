import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from './useAuth';

/**
 * Hides pages from logged-out users. This is UX only, NOT security: anyone can edit the
 * JS in their browser. The real protection is the API rejecting requests without a valid token.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const location = useLocation();

  if (state.status === 'loading') return <p className="muted center">Loading…</p>;
  if (state.status === 'anonymous') {
    // Remember where they were going, so login can send them back there.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return children;
}

/** The opposite: logged-in users visiting /login or /register go home. */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  if (state.status === 'loading') return <p className="muted center">Loading…</p>;
  if (state.status === 'authenticated') return <Navigate to="/" replace />;
  return children;
}
