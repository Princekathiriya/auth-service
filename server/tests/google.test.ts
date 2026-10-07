import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey } from 'jose';
import { createApp } from '../src/app.js';
import { UserModel } from '../src/models/User.js';
import { RefreshTokenModel } from '../src/models/RefreshToken.js';
import { setGoogleKeys } from '../src/modules/auth/google.js';

const app = createApp();
const CLIENT_ID = 'test-client-id.apps.googleusercontent.com';

// We play Google: our own RSA key signs the ID tokens, and the app is told to trust it.
let googlePrivateKey: CryptoKey;
let attackerPrivateKey: CryptoKey;
beforeAll(async () => {
  const google = await generateKeyPair('RS256');
  googlePrivateKey = google.privateKey;
  attackerPrivateKey = (await generateKeyPair('RS256')).privateKey;
  setGoogleKeys(createLocalJWKSet({ keys: [{ ...(await exportJWK(google.publicKey)), kid: 'k1', alg: 'RS256' }] }));
});
afterEach(() => vi.restoreAllMocks());

const cookiesOf = (res: request.Response) => (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
const findCookie = (res: request.Response, name: string) => cookiesOf(res).find((c) => c.startsWith(`${name}=`));

/** Step 1: hit /auth/google like a browser would. */
async function startLogin() {
  const res = await request(app).get('/auth/google');
  const url = new URL(res.headers.location!);
  const cookie = findCookie(res, 'oauth_google')!;
  return { res, url, cookie: cookie.split(';')[0]!, state: url.searchParams.get('state')!, nonce: url.searchParams.get('nonce')! };
}

interface IdTokenOptions {
  claims?: Record<string, unknown>;
  key?: CryptoKey;
  audience?: string;
  issuer?: string;
}
function makeIdToken(nonce: string, { claims = {}, key = googlePrivateKey, audience = CLIENT_ID, issuer = 'https://accounts.google.com' }: IdTokenOptions = {}) {
  return new SignJWT({ email: 'dana@gmail.com', email_verified: true, name: 'Dana', nonce, ...claims })
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setSubject('google-sub-123')
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);
}

/** Stub Google's token endpoint: whatever code we're given, answer with this ID token. */
function mockGoogleTokenEndpoint(idToken: string) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id_token: idToken }), { status: 200 }));
}

/** Full happy path: start login, "Google" returns a token, browser lands on the callback. */
async function completeLogin(idTokenOptions: IdTokenOptions = {}) {
  const { cookie, state, nonce } = await startLogin();
  const fetchSpy = mockGoogleTokenEndpoint(await makeIdToken(nonce, idTokenOptions));
  const res = await request(app).get('/auth/google/callback').query({ code: 'auth-code', state }).set('Cookie', cookie);
  return { res, fetchSpy };
}

const failedWith = (res: request.Response, code: string) => {
  expect(res.status).toBe(302);
  expect(res.headers.location).toBe(`http://localhost:5173/login?error=${code}`);
  expect(findCookie(res, 'refresh_token')).toBeUndefined();
};

describe('GET /auth/google', () => {
  it('redirects to Google with state, nonce, and a PKCE S256 challenge', async () => {
    const { res, url } = await startLogin();
    expect(res.status).toBe(302);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(CLIENT_ID);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('state')!.length).toBeGreaterThan(30);
    expect(url.searchParams.get('nonce')!.length).toBeGreaterThan(30);
  });

  it('stores the attempt in an httpOnly, SameSite=Lax cookie scoped to /auth/google', async () => {
    const { res } = await startLogin();
    const cookie = findCookie(res, 'oauth_google')!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Lax/);
    expect(cookie).toMatch(/Path=\/auth\/google/);
  });

  it('the challenge is the SHA-256 of the verifier, and the verifier is never in the URL', async () => {
    const { url, cookie } = await startLogin();
    const saved = JSON.parse(decodeURIComponent(cookie.split('=').slice(1).join('=')));
    const expected = createHash('sha256').update(saved.codeVerifier).digest('base64url');
    expect(url.searchParams.get('code_challenge')).toBe(expected);
    expect(url.toString()).not.toContain(saved.codeVerifier);
  });

  it('every attempt gets fresh random values', async () => {
    const a = await startLogin();
    const b = await startLogin();
    expect(a.state).not.toBe(b.state);
    expect(a.nonce).not.toBe(b.nonce);
  });
});

describe('GET /auth/google/callback', () => {
  it('creates a verified, password-less user and starts a session', async () => {
    const { res } = await completeLogin();
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('http://localhost:5173/auth/callback');
    expect(findCookie(res, 'refresh_token')).toMatch(/HttpOnly/);
    const user = await UserModel.findOne({ email: 'dana@gmail.com' }).select('+passwordHash');
    expect(user).toMatchObject({ googleId: 'google-sub-123', name: 'Dana', emailVerified: true });
    expect(user!.passwordHash).toBeUndefined();
  });

  it('never puts tokens in the redirect URL', async () => {
    const { res } = await completeLogin();
    expect(res.headers.location).not.toMatch(/token/i);
  });

  it('the session works: the refresh cookie gives an access token', async () => {
    const { res } = await completeLogin();
    const refresh = await request(app).post('/auth/refresh').set('Cookie', findCookie(res, 'refresh_token')!.split(';')[0]!);
    expect(refresh.status).toBe(200);
    expect(refresh.body.user.email).toBe('dana@gmail.com');
  });

  it('sends the PKCE verifier and client secret to Google when exchanging the code', async () => {
    const { cookie, state, nonce } = await startLogin();
    const saved = JSON.parse(decodeURIComponent(cookie.split('=').slice(1).join('=')));
    const spy = mockGoogleTokenEndpoint(await makeIdToken(nonce));
    await request(app).get('/auth/google/callback').query({ code: 'auth-code', state }).set('Cookie', cookie);
    const body = new URLSearchParams(spy.mock.calls[0]![1]!.body as URLSearchParams);
    expect(body.get('code')).toBe('auth-code');
    expect(body.get('code_verifier')).toBe(saved.codeVerifier);
    expect(body.get('client_secret')).toBe('test-client-secret');
  });

  it('clears the one-time oauth cookie', async () => {
    const { res } = await completeLogin();
    expect(findCookie(res, 'oauth_google')).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('logging in again with the same Google account reuses the user', async () => {
    await completeLogin();
    await completeLogin();
    expect(await UserModel.countDocuments()).toBe(1);
  });

  it('matches on Google id, not email (Google emails can change)', async () => {
    await completeLogin();
    await completeLogin({ claims: { email: 'dana.new@gmail.com' } });
    expect(await UserModel.countDocuments()).toBe(1);
  });

  describe('linking to an existing password account', () => {
    const creds = { email: 'dana@gmail.com', name: 'Dana', password: 'correct-horse-battery' };

    it('links a verified account and keeps its password', async () => {
      await request(app).post('/auth/register').send(creds);
      await UserModel.updateOne({ email: creds.email }, { emailVerified: true });
      await completeLogin();
      expect(await UserModel.countDocuments()).toBe(1);
      expect((await UserModel.findOne())!.googleId).toBe('google-sub-123');
      expect((await request(app).post('/auth/login').send(creds)).status).toBe(200);
    });

    it('pre-account hijacking: an UNVERIFIED account loses its password and sessions', async () => {
      // Attacker registers the victim's email first, with the attacker's password.
      const attacker = await request(app).post('/auth/register').send({ ...creds, password: 'attacker-password' });
      const attackerCookie = findCookie(attacker, 'refresh_token')!.split(';')[0]!;
      // Real owner signs in with Google.
      await completeLogin();
      // Attacker's password and session are both dead.
      expect((await request(app).post('/auth/login').send({ ...creds, password: 'attacker-password' })).status).toBe(401);
      expect((await request(app).post('/auth/refresh').set('Cookie', attackerCookie)).status).toBe(401);
      expect((await UserModel.findOne())!.emailVerified).toBe(true);
    });
  });

  describe('rejects', () => {
    it('a state that does not match the cookie (login CSRF)', async () => {
      const { cookie, nonce } = await startLogin();
      mockGoogleTokenEndpoint(await makeIdToken(nonce));
      const res = await request(app).get('/auth/google/callback').query({ code: 'c', state: 'attacker-state' }).set('Cookie', cookie);
      failedWith(res, 'OAUTH_STATE_MISMATCH');
    });

    it('a callback with no oauth cookie', async () => {
      const res = await request(app).get('/auth/google/callback').query({ code: 'c', state: 's' });
      failedWith(res, 'OAUTH_STATE_MISMATCH');
    });

    it('the user cancelling on Google', async () => {
      const { cookie, state } = await startLogin();
      const res = await request(app).get('/auth/google/callback').query({ error: 'access_denied', state }).set('Cookie', cookie);
      failedWith(res, 'OAUTH_DENIED');
    });

    it('an ID token signed by someone other than Google', async () => {
      failedWith((await completeLogin({ key: attackerPrivateKey })).res, 'OAUTH_FAILED');
    });

    it('an ID token issued for a different app (wrong audience)', async () => {
      failedWith((await completeLogin({ audience: 'other-app.apps.googleusercontent.com' })).res, 'OAUTH_FAILED');
    });

    it('an ID token from a different issuer', async () => {
      failedWith((await completeLogin({ issuer: 'https://evil.example' })).res, 'OAUTH_FAILED');
    });

    it('an ID token with the wrong nonce (replay)', async () => {
      failedWith((await completeLogin({ claims: { nonce: 'old-nonce' } })).res, 'OAUTH_FAILED');
    });

    it('a Google account whose email is not verified', async () => {
      failedWith((await completeLogin({ claims: { email_verified: false } })).res, 'OAUTH_EMAIL_UNVERIFIED');
      expect(await UserModel.countDocuments()).toBe(0);
    });

    it('Google token endpoint errors (e.g. code already used)', async () => {
      const { cookie, state } = await startLogin();
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"error":"invalid_grant"}', { status: 400 }));
      const res = await request(app).get('/auth/google/callback').query({ code: 'c', state }).set('Cookie', cookie);
      failedWith(res, 'OAUTH_FAILED');
    });
  });
});

describe('password login for a Google-only user', () => {
  it('fails with the normal 401 (there is no password)', async () => {
    await completeLogin();
    const res = await request(app).post('/auth/login').send({ email: 'dana@gmail.com', password: 'anything-at-all' });
    expect(res.status).toBe(401);
    expect(await RefreshTokenModel.countDocuments()).toBe(1); // only the Google session
  });
});
