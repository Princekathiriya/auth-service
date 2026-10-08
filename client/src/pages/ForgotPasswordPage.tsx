import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { authApi } from '../lib/api';
import { ErrorBanner, Field, describeError } from '../components/Form';

export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<ReturnType<typeof describeError> | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const email = String(new FormData(e.currentTarget).get('email'));
    setPending(true);
    setError(null);
    try {
      await authApi.forgotPassword(email);
      setSentTo(email);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  if (sentTo) {
    // Same wording whether or not the account exists, exactly like the API.
    return (
      <main className="card">
        <h1>Check your email</h1>
        <p className="banner banner-info">
          If an account exists for {sentTo}, we sent a link to reset your password. It expires in 30 minutes.
        </p>
        <p><Link to="/login">Back to log in</Link></p>
      </main>
    );
  }

  return (
    <main className="card">
      <h1>Forgot password</h1>
      <p className="muted">Enter your email and we'll send you a reset link.</p>
      <ErrorBanner message={error?.message ?? null} />
      <form onSubmit={onSubmit} noValidate>
        <Field label="Email" name="email" type="email" autoComplete="email" required error={error?.fields.email} />
        <button type="submit" disabled={pending}>{pending ? 'Sending…' : 'Send reset link'}</button>
      </form>
      <p className="muted"><Link to="/login">Back to log in</Link></p>
    </main>
  );
}
