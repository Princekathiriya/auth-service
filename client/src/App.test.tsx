import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from './auth/AuthContext';
import { App } from './App';
import { clearSession } from './lib/api';
import { json, mockFetch, user } from './test/mockFetch';

beforeEach(() => clearSession());

function renderApp(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

const noSession = (url: string) => (url.endsWith('/auth/refresh') ? json(401, { error: { code: 'INVALID_REFRESH_TOKEN', message: 'x' } }) : null);

describe('routing and session restore', () => {
  it('a logged-out visitor to / is sent to the login page', async () => {
    mockFetch((url) => noSession(url) ?? json(404));
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });

  it('a valid refresh cookie restores the session on page load', async () => {
    mockFetch(() => json(200, { user, accessToken: 'tok' }));
    renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Hi, Erin' })).toBeInTheDocument();
  });

  it('a logged-in user visiting /login is sent home', async () => {
    mockFetch(() => json(200, { user, accessToken: 'tok' }));
    renderApp('/login');
    expect(await screen.findByRole('heading', { name: 'Hi, Erin' })).toBeInTheDocument();
  });
});

describe('login form', () => {
  it('shows the server error for wrong credentials', async () => {
    mockFetch((url) => noSession(url) ?? json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }));
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'erin@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong-password');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password');
  });

  it('shows a friendly message when rate limited', async () => {
    mockFetch((url) => noSession(url) ?? json(429, { error: { code: 'RATE_LIMITED', message: 'Too many requests.' } }));
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'erin@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'x');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/wait a few minutes/);
  });

  it('logs in and shows the profile', async () => {
    mockFetch((url) => noSession(url) ?? json(200, { user, accessToken: 'tok' }));
    renderApp('/login');
    await userEvent.type(await screen.findByLabelText('Email'), 'erin@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'correct-horse-battery');
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(await screen.findByRole('heading', { name: 'Hi, Erin' })).toBeInTheDocument();
    expect(screen.getByText('unverified')).toBeInTheDocument();
  });
});

describe('register form', () => {
  it('marks a short password before calling the server', async () => {
    const spy = mockFetch((url) => noSession(url) ?? json(201, { user, accessToken: 'tok' }));
    renderApp('/register');
    await userEvent.type(await screen.findByLabelText('Name'), 'Erin');
    await userEvent.type(screen.getByLabelText('Email'), 'erin@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'short');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(screen.getByLabelText('Password')).toHaveAttribute('aria-invalid', 'true');
    expect(spy.mock.calls.some(([u]) => String(u).endsWith('/auth/register'))).toBe(false);
  });

  it('shows field errors returned by the server', async () => {
    mockFetch((url) => noSession(url) ?? json(409, { error: { code: 'EMAIL_TAKEN', message: 'An account with this email already exists' } }));
    renderApp('/register');
    await userEvent.type(await screen.findByLabelText('Name'), 'Erin');
    await userEvent.type(screen.getByLabelText('Email'), 'erin@example.com');
    await userEvent.type(screen.getByLabelText('Password'), 'long-enough-pw');
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already exists');
  });
});

describe('logout', () => {
  it('returns to the login page', async () => {
    mockFetch((url) => (url.endsWith('/auth/logout') ? json(204) : json(200, { user, accessToken: 'tok' })));
    renderApp('/');
    await userEvent.click(await screen.findByRole('button', { name: 'Log out' }));
    expect(await screen.findByRole('heading', { name: 'Log in' })).toBeInTheDocument();
  });
});
