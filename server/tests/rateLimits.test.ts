import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../src/app.js';

// A fresh app per test = fresh in-memory counters, so tests don't affect each other.
let app: Express;
beforeEach(() => {
  app = createApp({ rateLimits: true });
});

const creds = { email: 'erin@example.com', name: 'Erin', password: 'correct-horse-battery' };
const login = (email: string, password: string) => request(app).post('/auth/login').send({ email, password });

async function repeat(times: number, fn: (i: number) => Promise<request.Response>) {
  const results: request.Response[] = [];
  for (let i = 0; i < times; i++) results.push(await fn(i)); // sequential: deterministic counting
  return results;
}

describe('login limits', () => {
  it('blocks an account after 10 failed attempts, even with the right password', async () => {
    await request(app).post('/auth/register').send(creds);
    const fails = await repeat(10, () => login(creds.email, 'wrong-password'));
    expect(fails.every((r) => r.status === 401)).toBe(true);

    const blocked = await login(creds.email, creds.password);
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });

  it('sends Retry-After and RateLimit headers', async () => {
    await repeat(10, () => login(creds.email, 'wrong-password'));
    const res = await login(creds.email, 'wrong-password');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    expect(res.headers['ratelimit']).toBeDefined();
  });

  it('cannot be bypassed by changing the email case or adding spaces', async () => {
    await repeat(10, (i) => login(i % 2 ? ' ERIN@example.com ' : 'erin@EXAMPLE.com', 'wrong-password'));
    expect((await login('erin@example.com', 'x')).status).toBe(429);
  });

  it('behaves identically for unknown emails (no account enumeration)', async () => {
    await repeat(10, () => login('ghost@example.com', 'wrong-password'));
    expect((await login('ghost@example.com', 'wrong-password')).status).toBe(429);
  });

  it('a locked account does not affect other accounts', async () => {
    await request(app).post('/auth/register').send(creds);
    await repeat(10, () => login('ghost@example.com', 'wrong-password'));
    expect((await login(creds.email, creds.password)).status).toBe(200);
  });

  it('successful logins do not count', async () => {
    await request(app).post('/auth/register').send(creds);
    const results = await repeat(15, () => login(creds.email, creds.password));
    expect(results.every((r) => r.status === 200)).toBe(true);
  });

  it('blocks one IP that tries many different accounts after 20 failures', async () => {
    await repeat(20, (i) => login(`victim${i}@example.com`, 'Password123!'));
    expect((await login('someone-new@example.com', 'Password123!')).status).toBe(429);
  });
});

describe('email bombing protection', () => {
  const forgot = (email: string) => request(app).post('/auth/forgot-password').send({ email });

  it('allows only 3 reset emails per address per hour', async () => {
    const ok = await repeat(3, () => forgot('victim@example.com'));
    expect(ok.every((r) => r.status === 202)).toBe(true);
    expect((await forgot('victim@example.com')).status).toBe(429);
  });

  it('other addresses are unaffected', async () => {
    await repeat(3, () => forgot('victim@example.com'));
    expect((await forgot('other@example.com')).status).toBe(202);
  });
});

describe('other limits', () => {
  it('allows 5 signups per IP per hour', async () => {
    const ok = await repeat(5, (i) => request(app).post('/auth/register').send({ ...creds, email: `u${i}@example.com` }));
    expect(ok.every((r) => r.status === 201)).toBe(true);
    expect((await request(app).post('/auth/register').send({ ...creds, email: 'u6@example.com' })).status).toBe(429);
  });

  it('global limit: 100 requests per minute per IP', async () => {
    await repeat(100, () => request(app).get('/nope'));
    expect((await request(app).get('/nope')).status).toBe(429);
  });

  it('health checks are never rate limited', async () => {
    await repeat(105, () => request(app).get('/health'));
    expect((await request(app).get('/health')).status).toBe(200);
  });

  it('a spoofed X-Forwarded-For chain cannot reset the counter', async () => {
    // With trust proxy = 1, only the LAST hop (added by our proxy) counts. An attacker can
    // prepend fake IPs, but can't change the last one.
    const forged = (i: number) =>
      request(app).post('/auth/login').set('X-Forwarded-For', `10.0.0.${i}, 203.0.113.7`).send({ email: `x${i}@example.com`, password: 'nope-nope' });
    await repeat(20, forged);
    expect((await forged(99)).status).toBe(429);
  });
});
