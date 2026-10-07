import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { redactUrl, serializeRequest } from '../src/utils/redact.js';

const app = createApp();

describe('password unicode normalisation', () => {
  it('a password typed with a composed é works when typed with e + combining accent', async () => {
    const composed = 'café-password'; // é as one character
    const decomposed = 'café-password'; // e + combining acute accent
    expect(composed).not.toBe(decomposed); // different strings...
    await request(app).post('/auth/register').send({ email: 'f@example.com', name: 'F', password: composed });
    const res = await request(app).post('/auth/login').send({ email: 'f@example.com', password: decomposed });
    expect(res.status).toBe(200); // ...same password
  });
});

describe('redactUrl (keeps secrets out of logs)', () => {
  it('redacts OAuth code and state', () => {
    expect(redactUrl('/auth/google/callback?code=4/abc&state=xyz')).toBe('/auth/google/callback?code=[REDACTED]&state=[REDACTED]');
  });

  it('keeps harmless params', () => {
    expect(redactUrl('/admin/users?page=2&search=bob')).toBe('/admin/users?page=2&search=bob');
  });

  it('redacts only the sensitive ones when mixed', () => {
    expect(redactUrl('/x?token=secret&page=1')).toBe('/x?token=[REDACTED]&page=1');
  });

  it('leaves URLs without a query alone', () => {
    expect(redactUrl('/health')).toBe('/health');
  });
});

describe('serializeRequest (what actually goes into each request log line)', () => {
  it('removes the parsed query object, which would otherwise repeat the secrets', () => {
    const out = serializeRequest({ method: 'GET', url: '/cb?code=abc', query: { code: 'abc' } });
    expect(out).toEqual({ method: 'GET', url: '/cb?code=[REDACTED]' });
    expect(JSON.stringify(out)).not.toContain('abc');
  });
});
