import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { authApi } from '../lib/api';
import { useAuth } from '../auth/useAuth';
import { describeError } from '../lib/errors';
import type { User } from '../lib/types';

/*
 * The token works ONCE. React StrictMode (dev) runs effects twice, so a naive
 * useEffect(() => verify(token)) sends two requests: the first succeeds, the second
 * fails with "invalid link", and the user sees an error for a link that worked.
 * Remembering the promise per token makes both effect runs share one request.
 */
const verifications = new Map<string, Promise<User>>();
function verifyOnce(token: string) {
  let p = verifications.get(token);
  if (!p) {
    p = authApi.verifyEmail(token);
    verifications.set(token, p);
  }
  return p;
}

type Status = { kind: 'working' } | { kind: 'done' } | { kind: 'failed'; message: string };

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { state, setUser } = useAuth();
  const loggedIn = state.status === 'authenticated';
  const [status, setStatus] = useState<Status>(token ? { kind: 'working' } : { kind: 'failed', message: 'This link is missing its token.' });

  useEffect(() => {
    if (!token) return;
    // Remove the token from the address bar, so it doesn't linger in history or screenshots.
    window.history.replaceState(null, '', window.location.pathname);
    verifyOnce(token)
      .then((user) => {
        if (loggedIn) setUser(user); // update the "unverified" badge without a reload
        setStatus({ kind: 'done' });
      })
      .catch((err: unknown) => setStatus({ kind: 'failed', message: describeError(err).message }));
  }, [token, loggedIn, setUser]);

  return (
    <main className="card">
      <h1>Email verification</h1>
      {status.kind === 'working' && <p className="muted">Verifying…</p>}
      {status.kind === 'done' && <p className="banner banner-info">Your email is verified.</p>}
      {status.kind === 'failed' && (
        <p role="alert" className="banner banner-error">
          {status.message} You can request a new link from your profile page.
        </p>
      )}
      <p>
        <Link to={loggedIn ? '/' : '/login'}>{loggedIn ? 'Go to your profile' : 'Log in'}</Link>
      </p>
    </main>
  );
}
