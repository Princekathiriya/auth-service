import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

describe('app skeleton', () => {
  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('unknown routes return a JSON 404', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('sets security headers and hides Express', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('rejects request bodies over the size limit', async () => {
    const res = await request(app).post('/health').send({ big: 'x'.repeat(20_000) });
    expect(res.status).toBe(413);
  });

  it('returns 400 (not 500) for malformed JSON', async () => {
    const res = await request(app).post('/health').set('Content-Type', 'application/json').send('{"bad json');
    expect(res.status).toBe(400);
  });
});
