import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { ErrorBanner, Field, describeError, fieldError } from '../components/Form';
import { GOOGLE_LOGIN_URL } from '../lib/config';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<ReturnType<typeof describeError> | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = String(form.get('password'));
    // Client-side checks are for fast feedback only. The server validates everything again.
    if (password.length < 8) {
      setError(fieldError('password', 'Password must be at least 8 characters'));
      return;
    }
    setPending(true);
    setError(null);
    try {
      await register(String(form.get('name')), String(form.get('email')), password);
      navigate('/', { replace: true, state: { justRegistered: true } });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="card">
      <h1>Create account</h1>
      <ErrorBanner message={error?.message ?? null} />
      <form onSubmit={onSubmit} noValidate>
        <Field label="Name" name="name" autoComplete="name" required error={error?.fields.name} />
        <Field label="Email" name="email" type="email" autoComplete="email" required error={error?.fields.email} />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          hint="At least 8 characters"
          error={error?.fields.password}
        />
        <button type="submit" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}</button>
      </form>
      <div className="divider"><span>or</span></div>
      <a className="button secondary full" href={GOOGLE_LOGIN_URL}>Continue with Google</a>
      <p className="muted">
        Already have an account? <Link to="/login">Log in</Link>
      </p>
    </main>
  );
}
