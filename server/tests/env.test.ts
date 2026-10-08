import { describe, it, expect } from 'vitest';
import { envSchema } from '../src/config/env.js';

const base = { MONGODB_URI: 'mongodb://x', JWT_ACCESS_SECRET: 'x'.repeat(32) };

describe('CLIENT_ORIGIN', () => {
  it.each([
    ['https://app.vercel.app/', 'https://app.vercel.app'],
    ['https://app.vercel.app', 'https://app.vercel.app'],
    ['https://App.Vercel.app/login', 'https://app.vercel.app'],
    ['http://localhost:5173/', 'http://localhost:5173'],
  ])('%s is normalised to %s (what browsers send as Origin)', (input, expected) => {
    expect(envSchema.parse({ ...base, CLIENT_ORIGIN: input }).CLIENT_ORIGIN).toBe(expected);
  });

  it('still rejects something that is not a URL', () => {
    expect(envSchema.safeParse({ ...base, CLIENT_ORIGIN: 'app.vercel.app' }).success).toBe(false);
  });
});
