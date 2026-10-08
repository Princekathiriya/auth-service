import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StrictMode } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from './auth/AuthContext';
import { App } from './App';
import { clearSession } from './lib/api';
import { json, mockFetch, user } from './test/mockFetch';

beforeEach(() => clearSession());

function renderApp(path: string) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <App />
        </AuthProvider>
      </MemoryRouter>
    </StrictMode>,
  );
}

const err = (status: number, code: string, message = code) => json(status, { error: { code, message } });
const anonymous = (url: string) => (url.endsWith('/auth/refresh') ? err(401, 'INVALID_REFRESH_TOKEN') : null);
const loggedInAs = (u: object) => (url: string) => (url.endsWith('/auth/refresh') ? json(200, { user: u, accessToken: 'tok' }) : null);
const callsTo = (spy: ReturnType<typeof mockFetch>, path: string) => spy.mock.calls.filter(([u]) => String(u).includes(path));

describe('verify email page', () => {
  it('verifies exactly ONCE even under React StrictMode (single-use token)', async () => {
    const spy = mockFetch((url) => anonymous(url) ?? json(200, { user: { ...user, emailVerified: true } }));
    renderApp('/verify-email?token=abc123abc123abc123abc123');
    expect(await screen.findByText('Your email is verified.')).toBeInTheDocument();
    expect(callsTo(spy, '/auth/verify-email')).toHaveLength(1);
  });

  it('shows the server message for an expired link', async () => {
    mockFetch((url) => anonymous(url) ?? err(400, 'INVALID_TOKEN', 'This link is invalid or has expired'));
    renderApp('/verify-email?token=expired-expired-expired-1');
    expect(await screen.findByRole('alert')).toHaveTextContent('invalid or has expired');
  });

  it('handles a link without a token', async () => {
    mockFetch((url) => anonymous(url) ?? json(404));
    renderApp('/verify-email');
    expect(await screen.findByRole('alert')).toHaveTextContent('missing its token');
  });
});

describe('forgot password page', () => {
  it('shows the same neutral message whatever the server says', async () => {
    mockFetch((url) => anonymous(url) ?? json(202, { message: 'ok' }));
    renderApp('/forgot-password');
    await userEvent.type(await screen.findByLabelText('Email'), 'who@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
    expect(await screen.findByText(/If an account exists for who@example.com/)).toBeInTheDocument();
  });
});

describe('reset password page', () => {
  async function fill(password: string, confirm: string) {
    await userEvent.type(await screen.findByLabelText('New password'), password);
    await userEvent.type(screen.getByLabelText('Confirm new password'), confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Set new password' }));
  }

  it('catches mismatched passwords without calling the server', async () => {
    const spy = mockFetch((url) => anonymous(url) ?? json(204));
    renderApp('/reset-password?token=tok-tok-tok-tok-tok-tok');
    await fill('new-password-1', 'new-password-2');
    expect(screen.getByLabelText('Confirm new password')).toHaveAttribute('aria-invalid', 'true');
    expect(callsTo(spy, '/auth/reset-password')).toHaveLength(0);
  });

  it('on success: logs out locally and sends to login with a notice', async () => {
    const spy = mockFetch((url) => anonymous(url) ?? json(204));
    renderApp('/reset-password?token=tok-tok-tok-tok-tok-tok');
    await fill('new-password-1', 'new-password-1');
    expect(await screen.findByText('Password changed. Log in with your new password.')).toBeInTheDocument();
    const body = JSON.parse(String(callsTo(spy, '/auth/reset-password')[0]![1]!.body));
    expect(body).toEqual({ token: 'tok-tok-tok-tok-tok-tok', password: 'new-password-1' });
  });

  it('offers a new link when the token expired', async () => {
    mockFetch((url) => anonymous(url) ?? err(400, 'INVALID_TOKEN', 'This link is invalid or has expired'));
    renderApp('/reset-password?token=tok-tok-tok-tok-tok-tok');
    await fill('new-password-1', 'new-password-1');
    expect(await screen.findByRole('link', { name: 'Request a new link' })).toBeInTheDocument();
  });
});

describe('Google login', () => {
  it('the button is a real link to the API (full-page navigation, not fetch)', async () => {
    mockFetch((url) => anonymous(url) ?? json(404));
    renderApp('/login');
    expect(await screen.findByRole('link', { name: 'Continue with Google' })).toHaveAttribute('href', 'http://localhost:4000/auth/google');
  });

  it('/auth/callback lands on the profile once the cookie session is restored', async () => {
    mockFetch((url) => loggedInAs(user)(url) ?? json(404));
    renderApp('/auth/callback');
    expect(await screen.findByRole('heading', { name: 'Hi, Erin' })).toBeInTheDocument();
  });

  it('/auth/callback without a session shows the error on the login page', async () => {
    mockFetch((url) => anonymous(url) ?? json(404));
    renderApp('/auth/callback');
    expect(await screen.findByRole('alert')).toHaveTextContent('Google sign-in failed');
  });

  it('maps known error codes and never echoes unknown query text', async () => {
    mockFetch((url) => anonymous(url) ?? json(404));
    renderApp('/login?error=<b>Call 555-SCAM</b>');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Google sign-in failed. Please try again.');
    expect(alert).not.toHaveTextContent('SCAM');
  });
});

describe('profile: resend verification', () => {
  it('sends a new link', async () => {
    const spy = mockFetch((url) => loggedInAs(user)(url) ?? json(204));
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Resend verification email' }));
    expect(await screen.findByText('New link sent.')).toBeInTheDocument();
    expect(callsTo(spy, '/auth/resend-verification')).toHaveLength(1);
  });

  it('if already verified elsewhere, refreshes the badge instead of showing an error', async () => {
    mockFetch((url) => {
      if (url.endsWith('/auth/refresh')) return json(200, { user, accessToken: 'tok' });
      if (url.endsWith('/auth/me')) return json(200, { user: { ...user, emailVerified: true } });
      return err(409, 'ALREADY_VERIFIED', 'Email is already verified');
    });
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Resend verification email' }));
    expect(await screen.findByText('verified')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('admin page', () => {
  const admin = { ...user, id: 'admin1', email: 'admin@example.com', name: 'Ada', role: 'admin' as const, emailVerified: true };
  const other = { ...user, id: 'u2', email: 'bob@example.com', name: 'Bob' };
  const list = (users: object[]) => json(200, { users, page: 1, limit: 10, total: users.length, totalPages: 1 });

  it('is hidden from non-admins (UX only; the API enforces it)', async () => {
    mockFetch((url) => loggedInAs(user)(url) ?? json(404));
    renderApp('/admin');
    expect(await screen.findByRole('alert')).toHaveTextContent('need admin access');
  });

  it('lists users; you cannot change your own role or delete yourself', async () => {
    mockFetch((url) => loggedInAs(admin)(url) ?? list([admin, other]));
    renderApp('/admin');
    expect(await screen.findByLabelText('Role for admin@example.com')).toBeDisabled();
    expect(screen.getByLabelText('Role for bob@example.com')).toBeEnabled();
    const myRow = screen.getByText('admin@example.com').closest('tr')!;
    expect(within(myRow).getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('changing a role sends PATCH and reloads the list', async () => {
    let bob = other;
    const spy = mockFetch((url, init) => {
      if (url.endsWith('/auth/refresh')) return json(200, { user: admin, accessToken: 'tok' });
      if (init.method === 'PATCH') {
        bob = { ...bob, role: 'admin' as never };
        return json(200, { user: bob });
      }
      return list([admin, bob]);
    });
    renderApp('/admin');
    await userEvent.selectOptions(await screen.findByLabelText('Role for bob@example.com'), 'admin');
    await vi.waitFor(() => expect(screen.getByLabelText('Role for bob@example.com')).toHaveValue('admin'));
    const patch = spy.mock.calls.find(([, i]) => i?.method === 'PATCH')!;
    expect(String(patch[0])).toContain('/admin/users/u2/role');
    expect(JSON.parse(String(patch[1]!.body))).toEqual({ role: 'admin' });
  });

  it('shows the server reason when an action is refused', async () => {
    mockFetch((url, init) => {
      if (url.endsWith('/auth/refresh')) return json(200, { user: admin, accessToken: 'tok' });
      if (init.method === 'PATCH') return err(409, 'LAST_ADMIN', 'Cannot remove the last admin');
      return list([admin, { ...other, role: 'admin' }]);
    });
    renderApp('/admin');
    await userEvent.selectOptions(await screen.findByLabelText('Role for bob@example.com'), 'user');
    expect(await screen.findByRole('alert')).toHaveTextContent('Cannot remove the last admin');
  });

  it('a slow response for an OLD search never overwrites the newer results', async () => {
    const slowResults = (ms: number, users: object[]) => new Promise<Response>((r) => setTimeout(() => r(list(users)), ms));
    mockFetch((url) => {
      if (url.endsWith('/auth/refresh')) return json(200, { user: admin, accessToken: 'tok' });
      if (url.includes('search=al')) return slowResults(10, [{ ...other, id: 'al', email: 'alice@example.com' }]); // newer, fast
      if (url.includes('search=a')) return slowResults(150, [{ ...other, id: 'aa', email: 'aaron@example.com' }]); // older, slow
      return list([admin]);
    });
    renderApp('/admin');
    const box = await screen.findByLabelText('Search by email');
    await userEvent.type(box, 'a');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await userEvent.type(box, 'l');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('alice@example.com')).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 250)); // let the slow, stale response arrive
    expect(screen.getByText('alice@example.com')).toBeInTheDocument();
    expect(screen.queryByText('aaron@example.com')).not.toBeInTheDocument();
  });

  it('search sends a properly encoded query', async () => {
    const spy = mockFetch((url) => loggedInAs(admin)(url) ?? list([admin]));
    renderApp('/admin');
    await userEvent.type(await screen.findByLabelText('Search by email'), 'a&b=c');
    await userEvent.click(screen.getByRole('button', { name: 'Search' }));
    await vi.waitFor(() => expect(callsTo(spy, 'search=')).toHaveLength(1));
    expect(String(callsTo(spy, 'search=')[0]![0])).toContain('search=a%26b%3Dc');
  });
});
