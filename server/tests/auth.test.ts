import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createApp } from '../src/app.js';
import { UserModel } from '../src/models/User.js';

const app = createApp();
const valid = { email: 'Alice@Example.com', name: 'Alice', password: 'correct-horse-battery' };

const register = (body: object = valid) => request(app).post('/auth/register').send(body);

describe('POST /auth/register', () => {
  it('creates a user and returns an access token', async () => {
    const res = await register();
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'alice@example.com', name: 'Alice', role: 'user', emailVerified: false });
  });

  it('never returns the password or its hash', async () => {
    const res = await register();
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('stores an argon2 hash, not the plain password', async () => {
    await register();
    const user = await UserModel.findOne({ email: 'alice@example.com' }).select('+passwordHash');
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('ignores a client-supplied role (no mass assignment)', async () => {
    const res = await register({ ...valid, role: 'admin', emailVerified: true });
    expect(res.body.user.role).toBe('user');
    expect(res.body.user.emailVerified).toBe(false);
  });

  it('rejects a duplicate email, case-insensitively', async () => {
    await register();
    const res = await register({ ...valid, email: 'ALICE@example.com' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('only lets one of two simultaneous signups with the same email succeed', async () => {
    const results = await Promise.all([register(), register()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
  });

  it.each([
    [{ ...valid, email: 'not-an-email' }, 'email'],
    [{ ...valid, password: 'short' }, 'password'],
    [{ ...valid, password: 'x'.repeat(129) }, 'password'],
    [{ ...valid, name: '   ' }, 'name'],
    [{ ...valid, email: { $ne: null } }, 'email'],
  ])('rejects invalid input (%j)', async (body, field) => {
    const res = await register(body);
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty(field);
  });
});

describe('POST /auth/login', () => {
  const login = (body: object) => request(app).post('/auth/login').send(body);

  it('logs in with correct credentials (email is case-insensitive)', async () => {
    await register();
    const res = await login({ email: 'ALICE@example.com', password: valid.password });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
  });

  it('gives the same 401 for wrong password and unknown email (no user enumeration)', async () => {
    await register();
    const wrongPw = await login({ email: valid.email, password: 'wrong-password' });
    const noUser = await login({ email: 'nobody@example.com', password: 'whatever123' });
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(wrongPw.body).toEqual(noUser.body);
  });

  it('rejects NoSQL-injection style input', async () => {
    await register();
    const res = await login({ email: valid.email, password: { $ne: null } });
    expect(res.status).toBe(400);
  });
});

describe('GET /auth/me', () => {
  it('returns the current user with a valid token', async () => {
    const { body } = await register();
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${body.accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('alice@example.com');
  });

  it('401s without a token', async () => {
    expect((await request(app).get('/auth/me')).status).toBe(401);
  });

  it('401s with a tampered token', async () => {
    const { body } = await register();
    const [h, , s] = body.accessToken.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: body.user.id, role: 'admin' })).toString('base64url');
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${h}.${forgedPayload}.${s}`);
    expect(res.status).toBe(401);
  });

  it('401s with a token signed by a different secret', async () => {
    const { body } = await register();
    const forged = await new SignJWT({ role: 'admin' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(body.user.id)
      .setIssuer('auth-service')
      .setAudience('auth-service-api')
      .setExpirationTime('15m')
      .sign(new TextEncoder().encode('attacker-secret-attacker-secret-attacker'));
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('401s with an expired token', async () => {
    const { body } = await register();
    const expired = await new SignJWT({ role: 'user' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(body.user.id)
      .setIssuer('auth-service')
      .setAudience('auth-service-api')
      .setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
      .setExpirationTime(Math.floor(Date.now() / 1000) - 60)
      .sign(new TextEncoder().encode('test-secret-that-is-at-least-32-characters-long'));
    const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${expired}`);
    expect(res.status).toBe(401);
  });
});
