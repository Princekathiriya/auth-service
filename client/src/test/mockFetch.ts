import { vi } from 'vitest';

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

export const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Replace global fetch with a handler; returns the spy so tests can inspect calls. */
export function mockFetch(handler: Handler) {
  const spy = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => Promise.resolve(handler(String(input), init)));
  vi.stubGlobal('fetch', spy);
  return spy;
}

export const user = {
  id: 'u1',
  email: 'erin@example.com',
  name: 'Erin',
  role: 'user' as const,
  emailVerified: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
