import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/useAuth';
import { ErrorBanner, Field } from '../components/Form';
import { describeError } from '../lib/errors';
import { GOOGLE_LOGIN_URL } from '../lib/config';

// The API redirects here with ?error=CODE when Google login fails. Map codes to friendly text
// (and never render the raw query value: it's attacker-controllable).
const GOOGLE_ERRORS: Record<string, string> = {
  OAUTH_DENIED: 'Google sign-in was cancelled.',
  OAUTH_EMAIL_UNVERIFIED: 'Your Google email address is not verified.',
  OAUTH_NOT_CONFIGURED: 'Google sign-in is not set up on this server.',
};

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const googleError = params.get('error');
  const notice = (location.state as { notice?: string } | null)?.notice;
  const [error, setError] = useState<ReturnType<typeof describeError> | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      await login(String(form.get('email')), String(form.get('password')));
      // Only follow internal paths ("/x"), never "//evil.com": an open redirect would let a
      // phishing link bounce users through our login to an attacker's site.
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from?.startsWith('/') && !from.startsWith('//') ? from : '/', { replace: true });
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="card">
      <h1>Log in</h1>
      {notice && <p className="banner banner-info">{notice}</p>}
      {googleError && !error && <ErrorBanner message={GOOGLE_ERRORS[googleError] ?? 'Google sign-in failed. Please try again.'} />}
      <ErrorBanner message={error?.message ?? null} />
      <form onSubmit={onSubmit} noValidate>
        <Field label="Email" name="email" type="email" autoComplete="email" required error={error?.fields.email} />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required error={error?.fields.password} />
        <button type="submit" disabled={pending}>{pending ? 'Logging in…' : 'Log in'}</button>
      </form>
      <p className="small"><Link to="/forgot-password">Forgot password?</Link></p>
      <div className="divider"><span>or</span></div>
      {/* A real link, not fetch: the browser has to actually go to Google's page. */}
      <a className="button secondary full" href={GOOGLE_LOGIN_URL}>Continue with Google</a>
      <p className="muted">
        No account? <Link to="/register">Create one</Link>
      </p>
    </main>
  );
}
