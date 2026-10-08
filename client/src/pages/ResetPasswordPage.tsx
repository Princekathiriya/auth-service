import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { authApi } from '../lib/api';
import { useAuth } from '../auth/useAuth';
import { ErrorBanner, Field, describeError, fieldError } from '../components/Form';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  // Read once and keep in state: the token must survive even after we clean the URL.
  const [token] = useState(() => params.get('token'));
  const { forgetSession } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<ReturnType<typeof describeError> | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password'));
    if (password.length < 8) {
      setError(fieldError('password', 'Password must be at least 8 characters'));
      return;
    }
    if (password !== form.get('confirm')) {
      setError(fieldError('confirm', "Passwords don't match"));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await authApi.resetPassword(token, password);
      // The server logged out every session, including this browser's. Mirror that locally.
      forgetSession();
      navigate('/login', { replace: true, state: { notice: 'Password changed. Log in with your new password.' } });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  if (!token) {
    return (
      <main className="card">
        <h1>Reset password</h1>
        <p role="alert" className="banner banner-error">This link is missing its token.</p>
        <p><Link to="/forgot-password">Request a new link</Link></p>
      </main>
    );
  }

  return (
    <main className="card">
      <h1>Choose a new password</h1>
      <ErrorBanner message={error?.message ?? null} />
      {error?.code === 'INVALID_TOKEN' && (
        <p><Link to="/forgot-password">Request a new link</Link></p>
      )}
      <form onSubmit={onSubmit} noValidate>
        <Field label="New password" name="password" type="password" autoComplete="new-password" required hint="At least 8 characters" error={error?.fields.password} />
        <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required error={error?.fields.confirm} />
        <button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Set new password'}</button>
      </form>
      <p className="muted small">This will log you out on every device.</p>
    </main>
  );
}
