import { useState } from 'react';
import { useLocation } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { ErrorBanner, describeError } from '../components/Form';

export function HomePage() {
  const { state, logout, logoutAll } = useAuth();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  if (state.status !== 'authenticated') return null; // RequireAuth guarantees this
  const { user } = state;
  const justRegistered = (location.state as { justRegistered?: boolean } | null)?.justRegistered;

  return (
    <main className="card">
      <h1>Hi, {user.name}</h1>
      {justRegistered && <p className="banner banner-info">Account created. We sent a verification link to {user.email}.</p>}
      {!user.emailVerified && !justRegistered && (
        <p className="banner banner-warn">Your email isn't verified yet. Check your inbox for the link.</p>
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
