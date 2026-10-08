import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { authApi } from '../lib/api';
import { useAuth } from '../auth/useAuth';
import { ErrorBanner } from '../components/Form';
import { describeError } from '../lib/errors';

export function HomePage() {
  const { state, logout, logoutAll, setUser } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent'>('idle');
  if (state.status !== 'authenticated') return null; // RequireAuth guarantees this
  const { user } = state;
  const justRegistered = (location.state as { justRegistered?: boolean } | null)?.justRegistered;

  async function resendVerification() {
    setResend('sending');
    setError(null);
    try {
      await authApi.resendVerification();
      setResend('sent');
    } catch (err) {
      setResend('idle');
      const described = describeError(err);
      // Verified in another tab meanwhile: just refresh what we show.
      if (described.code === 'ALREADY_VERIFIED') setUser(await authApi.me());
      else setError(described.message);
    }
  }

  return (
    <main className="card">
      <h1>Hi, {user.name}</h1>
      {justRegistered && <p className="banner banner-info">Account created. We sent a verification link to {user.email}.</p>}
      {!user.emailVerified && (
        <div className="banner banner-warn">
          {!justRegistered && <>Your email isn't verified yet. Check your inbox for the link. </>}
          {resend === 'sent' ? (
            <strong>New link sent.</strong>
          ) : (
            <button type="button" className="link" disabled={resend === 'sending'} onClick={() => void resendVerification()}>
              {resend === 'sending' ? 'Sending…' : 'Resend verification email'}
            </button>
          )}
        </div>
      )}
      <ErrorBanner message={error} />

      <dl className="details">
        <dt>Email</dt>
        <dd>
          {user.email} {user.emailVerified ? <span className="badge ok">verified</span> : <span className="badge warn">unverified</span>}
        </dd>
        <dt>Role</dt>
        <dd>{user.role}</dd>
        <dt>Member since</dt>
        <dd>{new Date(user.createdAt).toLocaleDateString()}</dd>
      </dl>

      {user.role === 'admin' && (
        <p><Link to="/admin">Manage users →</Link></p>
      )}

      <div className="actions">
        <button type="button" onClick={() => void logout()}>Log out</button>
        <button
          type="button"
          className="secondary"
          onClick={() => logoutAll().catch((err: unknown) => setError(describeError(err).message))}
        >
          Log out of all devices
        </button>
      </div>
    </main>
  );
}
