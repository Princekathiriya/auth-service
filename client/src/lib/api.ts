import { API_URL } from './config';
import type { AuthResponse, User } from './types';

/** Mirrors the server's error shape: { error: { code, message, details? } } */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/*
 * The access token lives ONLY in this module variable (memory).
 * Not localStorage: any XSS bug could read localStorage and send the token to an attacker.
 * The cost: a page reload forgets it. That's fine, because the httpOnly refresh cookie
 * survives reloads, and we call /auth/refresh on startup to get a new access token.
 */
let accessToken: string | null = null;
let onSessionExpired: (() => void) | null = null;

export const getAccessToken = () => accessToken;

export function clearSession() {
  accessToken = null;
}

/** The AuthProvider registers this, so a dead session anywhere logs the UI out. */
export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Send the Bearer token and, on 401, try one refresh + retry. False for login/register/etc. */
  auth?: boolean;
}

async function rawRequest<T>(path: string, { method = 'GET', body, auth = true }: RequestOptions): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'include', // send/receive the refresh cookie on this cross-origin request
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server. Check your connection and try again.');
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { error?: { code?: string; message?: string; details?: Record<string, string[]> } } | null;
  if (!res.ok) {
    const e = data?.error;
    throw new ApiError(res.status, e?.code ?? 'UNKNOWN', e?.message ?? `Request failed (${res.status})`, e?.details);
  }
  return data as T;
}

/**
 * Only one refresh may run at a time. This matters because every refresh token works ONCE:
 * if 3 requests get a 401 together and each called /auth/refresh with the same cookie,
 * the server would see token reuse. So all callers share the same in-flight promise.
 */
let refreshInFlight: Promise<AuthResponse> | null = null;

export function refreshSession(): Promise<AuthResponse> {
  refreshInFlight ??= withCrossTabLock(() => rawRequest<AuthResponse>('/auth/refresh', { method: 'POST', auth: false }))
    .then((result) => {
      accessToken = result.accessToken;
      return result;
    })
    .catch((err: unknown) => {
      if (err instanceof ApiError && err.status === 401) accessToken = null;
      throw err;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/**
 * The promise above only de-duplicates inside ONE tab. Two tabs share one cookie, so they
 * can still race. The Web Locks API gives a lock shared by all tabs of this site: tab B
 * waits until tab A's refresh finishes, and by then the browser holds A's NEW cookie, so
 * B's refresh succeeds instead of looking like a stolen token.
 */
function withCrossTabLock<T>(fn: () => Promise<T>): Promise<T> {
  if (typeof navigator !== 'undefined' && 'locks' in navigator) {
    return navigator.locks.request('auth-refresh', fn);
  }
  return fn(); // old browsers / tests: the server's 10s grace window covers the rare race
}

/** Make an API call. Authenticated calls transparently refresh an expired access token once. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options);
  } catch (err) {
    const isAuthCall = options.auth ?? true;
    if (!(err instanceof ApiError) || err.status !== 401 || !isAuthCall) throw err;

    try {
      await refreshSession();
    } catch {
      onSessionExpired?.(); // refresh cookie is dead too: the user must log in again
      throw err;
    }
    return rawRequest<T>(path, options); // retry exactly once: never loop
  }
}

// --- Endpoint helpers: one place that knows URLs and shapes ---

async function storeTokens(promise: Promise<AuthResponse>) {
  const result = await promise;
  accessToken = result.accessToken;
  return result.user;
}

export const authApi = {
  login: (email: string, password: string) =>
    storeTokens(api<AuthResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false })),

  register: (name: string, email: string, password: string) =>
    storeTokens(api<AuthResponse>('/auth/register', { method: 'POST', body: { name, email, password }, auth: false })),

  async logout() {
    try {
      await api<void>('/auth/logout', { method: 'POST', auth: false });
    } finally {
      clearSession(); // forget the token locally even if the network call failed
    }
  },

  async logoutAll() {
    await api<void>('/auth/logout-all', { method: 'POST' });
    clearSession();
  },

  me: () => api<{ user: User }>('/auth/me').then((r) => r.user),
};
