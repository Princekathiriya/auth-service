import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { EmailTokenModel } from '../src/models/EmailToken.js';
import { UserModel } from '../src/models/User.js';
import { fakeMailer, tokenFromLastEmail } from './helpers/fakeMailer.js';

const app = createApp();
const creds = { email: 'carol@example.com', name: 'Carol', password: 'correct-horse-battery' };

const signup = (body: object = creds) => request(app).post('/auth/register').send(body);
const verify = (token: string) => request(app).post('/auth/verify-email').send({ token });
const forgot = (email: string) => request(app).post('/auth/forgot-password').send({ email });
const reset = (token: string, password = 'brand-new-password') =>
  request(app).post('/auth/reset-password').send({ token, password });
const login = (password: string) => request(app).post('/auth/login').send({ email: creds.email, password });
const refreshCookieOf = (res: request.Response) =>
  (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('refresh_token='))!.split(';')[0]!;

describe('email verification', () => {
  it('register sends a verification email with a link to the frontend', async () => {
    await signup();
    expect(fakeMailer.sent).toHaveLength(1);
    expect(fakeMailer.sent[0]!.subject).toBe('Verify your email');
    expect(fakeMailer.sent[0]!.text).toContain('http://localhost:5173/verify-email?token=');
  });

  it('a valid link verifies the email', async () => {
    await signup();
    const res = await verify(tokenFromLastEmail(creds.email));
    expect(res.status).toBe(200);
    expect(res.body.user.emailVerified).toBe(true);
  });

  it('a link works only once', async () => {
    await signup();
    const token = tokenFromLastEmail(creds.email);
    await verify(token);
    const res = await verify(token);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('an expired link is rejected', async () => {
    await signup();
    await EmailTokenModel.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await verify(tokenFromLastEmail(creds.email))).status).toBe(400);
  });

  it('a garbage token is rejected', async () => {
    expect((await verify('x'.repeat(43))).status).toBe(400);
  });

  it('stores only a hash of the token', async () => {
    await signup();
    const doc = await EmailTokenModel.findOne();
    expect(doc!.tokenHash).not.toBe(tokenFromLastEmail(creds.email));
  });

  it('escapes HTML in the user name (no phishing links injected into our emails)', async () => {
    await signup({ ...creds, name: '<a href="https://evil.example">Click</a>' });
    const { html } = fakeMailer.sent[0]!;
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain('&lt;a href=&quot;https://evil.example&quot;&gt;');
  });

  it('signup still succeeds if the email provider is down', async () => {
    fakeMailer.failNext = true;
    expect((await signup()).status).toBe(201);
  });

  describe('resend', () => {
    it('sends a new link and invalidates the old one', async () => {
      const { body } = await signup();
      const oldToken = tokenFromLastEmail(creds.email);
      const res = await request(app).post('/auth/resend-verification').set('Authorization', `Bearer ${body.accessToken}`);
      expect(res.status).toBe(204);
      const newToken = tokenFromLastEmail(creds.email);
      expect(newToken).not.toBe(oldToken);
      expect((await verify(oldToken)).status).toBe(400);
      expect((await verify(newToken)).status).toBe(200);
    });

    it('409s if already verified', async () => {
      const { body } = await signup();
      await verify(tokenFromLastEmail(creds.email));
      const res = await request(app).post('/auth/resend-verification').set('Authorization', `Bearer ${body.accessToken}`);
      expect(res.status).toBe(409);
    });

    it('requires login', async () => {
      expect((await request(app).post('/auth/resend-verification')).status).toBe(401);
    });
  });
});

describe('password reset', () => {
  // The reset work runs in the background after the response, so wait for the email.
  async function requestReset() {
    await forgot(creds.email);
    await vi.waitFor(() => expect(fakeMailer.sent.some((m) => m.subject === 'Reset your password')).toBe(true));
    return tokenFromLastEmail(creds.email);
  }

  it('forgot-password gives the same response for real and unknown emails (no enumeration)', async () => {
    await signup();
    const real = await forgot(creds.email);
    const fake = await forgot('nobody@example.com');
    expect(real.status).toBe(202);
    expect(real.body).toEqual(fake.body);
  });

  it('only emails real accounts', async () => {
    await forgot('nobody@example.com');
    await new Promise((r) => setTimeout(r, 50));
    expect(fakeMailer.sent).toHaveLength(0);
  });

  it('resets the password: old one stops working, new one works', async () => {
    await signup();
    const res = await reset(await requestReset());
    expect(res.status).toBe(204);
    expect((await login(creds.password)).status).toBe(401);
    expect((await login('brand-new-password')).status).toBe(200);
  });

  it('logs out every existing session', async () => {
    const reg = await signup();
    await reset(await requestReset());
    const res = await request(app).post('/auth/refresh').set('Cookie', refreshCookieOf(reg));
    expect(res.status).toBe(401);
  });

  it('marks the email as verified (the user proved they own the inbox)', async () => {
    await signup();
    await reset(await requestReset());
    const user = await UserModel.findOne({ email: creds.email });
    expect(user!.emailVerified).toBe(true);
  });

  it('a reset link works only once', async () => {
    await signup();
    const token = await requestReset();
    await reset(token);
    expect((await reset(token, 'another-password-1')).status).toBe(400);
  });

  it('an expired reset link is rejected', async () => {
    await signup();
    const token = await requestReset();
    await EmailTokenModel.updateMany({ type: 'reset_password' }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await reset(token)).status).toBe(400);
  });

  it('requesting a new link invalidates the previous one', async () => {
    await signup();
    const first = await requestReset();
    fakeMailer.reset();
    const second = await requestReset();
    expect((await reset(first)).status).toBe(400);
    expect((await reset(second)).status).toBe(204);
  });

  it('a verify-email token cannot be used to reset the password', async () => {
    await signup();
    const verifyToken = tokenFromLastEmail(creds.email);
    expect((await reset(verifyToken)).status).toBe(400);
  });

  it('still enforces password rules', async () => {
    await signup();
    const res = await reset(await requestReset(), 'short');
    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty('password');
  });
});
