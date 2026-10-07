import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiError, api, authApi, clearSession, getAccessToken, refreshSession, setSessionExpiredHandler } from './api';
import { json, mockFetch, user } from '../test/mockFetch';

beforeEach(() => {
  clearSession();
  setSessionExpiredHandler(null);
});

const authHeader = (init: RequestInit) => (init.headers as Record<string, string>).Authorization;

describe('access token storage', () => {
  it('keeps the token in memory only, never in localStorage or sessionStorage', async () => {
    mockFetch(() => json(200, { user, accessToken: 'tok-1' }));
    await authApi.login('erin@example.com', 'pw');
    expect(getAccessToken()).toBe('tok-1');
    expect(JSON.stringify({ ...localStorage })).not.toContain('tok-1');
    expect(JSON.stringify({ ...sessionStorage })).not.toContain('tok-1');
  });

  it('always sends cookies (credentials: include)', async () => {
    const spy = mockFetch(() => json(200, { user }));
    await api('/auth/me');
    expect(spy.mock.calls[0]![1]!.credentials).toBe('include');
  });
});

describe('refreshSession', () => {
  it('three simultaneous callers trigger exactly ONE refresh request', async () => {
    const spy = mockFetch(() => json(200, { user, accessToken: 'new' }));
    await Promise.all([refreshSession(), refreshSession(), refreshSession()]);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('a later refresh after the first finished makes a new request', async () => {
    const spy = mockFetch(() => json(200, { user, accessToken: 'new' }));
    await refreshSession();
    await refreshSession();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('clears the token when the refresh cookie is rejected', async () => {
    mockFetch(() => json(200, { user, accessToken: 'tok' }));
    await authApi.login('a@b.c', 'pw');
    mockFetch(() => json(401, { error: { code: 'INVALID_REFRESH_TOKEN', message: 'nope' } }));
    await expect(refreshSession()).rejects.toBeInstanceOf(ApiError);
    expect(getAccessToken()).toBeNull();
  });
});

describe('api() automatic refresh', () => {
  it('on 401: refreshes once, then retries the request with the NEW token', async () => {
    let meCalls = 0;
    const spy = mockFetch((url, init) => {
      if (url.endsWith('/auth/refresh')) return json(200, { user, accessToken: 'fresh' });
      meCalls++;
      return authHeader(init) === 'Bearer fresh' ? json(200, { user }) : json(401, { error: { code: 'UNAUTHENTICATED', message: 'expired' } });
    });
    const result = await authApi.me();
    expect(result.email).toBe(user.email);
    expect(meCalls).toBe(2);
    expect(spy).toHaveBeenCalledTimes(3); // me (401) → refresh → me (200)
  });

  it('5 parallel requests that all get 401 share a single refresh', async () => {
    const spy = mockFetch((url, init) => {
      if (url.endsWith('/auth/refresh')) return json(200, { user, accessToken: 'fresh' });
      return authHeader(init) === 'Bearer fresh' ? json(200, { user }) : json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } });
    });
    await Promise.all(Array.from({ length: 5 }, () => authApi.me()));
    expect(spy.mock.calls.filter(([u]) => String(u).endsWith('/auth/refresh'))).toHaveLength(1);
  });

  it('if refresh fails: reports the session as expired and does NOT loop', async () => {
    const expired = vi.fn();
    setSessionExpiredHandler(expired);
    const spy = mockFetch(() => json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }));
    await expect(authApi.me()).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledOnce();
    expect(spy).toHaveBeenCalledTimes(2); // me → refresh, then stop
  });

  it('does not try to refresh for login (a 401 there just means wrong password)', async () => {
    const spy = mockFetch(() => json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } }));
    await expect(authApi.login('a@b.c', 'wrong')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('does not refresh on 403 (logged in, but not allowed)', async () => {
    const spy = mockFetch(() => json(403, { error: { code: 'FORBIDDEN', message: 'no' } }));
    await expect(api('/admin/users')).rejects.toMatchObject({ status: 403 });
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('errors', () => {
  it('turns a network failure into a friendly ApiError', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    await expect(api('/auth/me')).rejects.toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });

  it('keeps the server error code, message and field details', async () => {
    mockFetch(() => json(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: { email: ['Invalid email'] } } }));
    await expect(authApi.register('n', 'bad', 'password1')).rejects.toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { email: ['Invalid email'] },
    });
  });

  it('logout forgets the token even if the server is unreachable', async () => {
    mockFetch(() => json(200, { user, accessToken: 'tok' }));
    await authApi.login('a@b.c', 'pw');
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('offline'))));
    await expect(authApi.logout()).rejects.toThrow();
    expect(getAccessToken()).toBeNull();
  });
});
