import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { RefreshTokenModel } from '../src/models/RefreshToken.js';
import { REUSE_GRACE_MS } from '../src/modules/auth/session.service.js';

const app = createApp();
const creds = { email: 'bob@example.com', name: 'Bob', password: 'correct-horse-battery' };

// Pull the raw refresh_token Set-Cookie header out of a response.
function refreshCookie(res: request.Response): string | undefined {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith('refresh_token='));
}
const cookieValue = (res: request.Response) => refreshCookie(res)!.split(';')[0]!.split('=')[1]!;
const refresh = (token: string) => request(app).post('/auth/refresh').set('Cookie', `refresh_token=${token}`);

async function signup() {
  const res = await request(app).post('/auth/register').send(creds);
  return { res, token: cookieValue(res), accessToken: res.body.accessToken as string };
}

// Simulate "the token was used long enough ago that this isn't a multi-tab race".
const ageRevocation = () =>
  RefreshTokenModel.updateMany(
    { revokedAt: { $ne: null } },
    { revokedAt: new Date(Date.now() - REUSE_GRACE_MS - 1000) },
  );

describe('refresh cookie', () => {
  it('is httpOnly, SameSite=Strict, scoped to /auth, and not in the JSON body', async () => {
    const { res } = await signup();
    const cookie = refreshCookie(res)!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/auth/);
    expect(cookie).toMatch(/Expires=/);
    expect(res.body.refreshToken).toBeUndefined();
  });

  it('is stored hashed in the database, never raw', async () => {
    const { token } = await signup();
    const doc = await RefreshTokenModel.findOne();
    expect(doc!.tokenHash).not.toBe(token);
    expect(doc!.tokenHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('POST /auth/refresh', () => {
  it('returns a new access token and rotates the refresh token', async () => {
    const { token } = await signup();
    const res = await refresh(token);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(cookieValue(res)).not.toBe(token);
  });

  it('the new access token works on /me', async () => {
    const { token } = await signup();
    const { body } = await refresh(token);
    const me = await request(app).get('/auth/me').set('Authorization', `Bearer ${body.accessToken}`);
    expect(me.status).toBe(200);
  });

  it('401s without a cookie, or with a garbage cookie', async () => {
    expect((await request(app).post('/auth/refresh')).status).toBe(401);
    expect((await refresh('garbage')).status).toBe(401);
  });

  it('a used token cannot be used again', async () => {
    const { token } = await signup();
    await refresh(token);
    expect((await refresh(token)).status).toBe(401);
  });

  it('reuse of an old token revokes the whole session (theft detection)', async () => {
    const { token: stolen } = await signup();
    const legit = cookieValue(await refresh(stolen)); // real user rotates
    await ageRevocation();

    expect((await refresh(stolen)).status).toBe(401); // attacker replays the old token...
    expect((await refresh(legit)).status).toBe(401); // ...so the current token is dead too
  });

  it('reuse within the grace window (e.g. two tabs) does NOT kill the session', async () => {
    const { token } = await signup();
    const newer = cookieValue(await refresh(token));
    expect((await refresh(token)).status).toBe(401); // second tab loses the race
    expect((await refresh(newer)).status).toBe(200); // but the session survives
  });

  it('two simultaneous refreshes with the same token: only one gets a new token', async () => {
    const { token } = await signup();
    const statuses = (await Promise.all([refresh(token), refresh(token)])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 401]);
  });

  it('401s for an expired refresh token', async () => {
    const { token } = await signup();
    await RefreshTokenModel.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await refresh(token)).status).toBe(401);
  });

  it('clears the cookie when refresh fails', async () => {
    const res = await refresh('garbage');
    expect(refreshCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
  });

  it('403s when called from another website (CSRF)', async () => {
    const { token } = await signup();
    const res = await refresh(token).set('Origin', 'https://evil.example');
    expect(res.status).toBe(403);
  });

  it('allows the configured frontend origin', async () => {
    const { token } = await signup();
    const res = await refresh(token).set('Origin', 'http://localhost:5173');
    expect(res.status).toBe(200);
  });
});

describe('logout', () => {
  it('revokes the session and clears the cookie', async () => {
    const { token } = await signup();
    const res = await request(app).post('/auth/logout').set('Cookie', `refresh_token=${token}`);
    expect(res.status).toBe(204);
    expect(refreshCookie(res)).toMatch(/Expires=Thu, 01 Jan 1970/);
    expect((await refresh(token)).status).toBe(401);
  });

  it('is idempotent: works without a cookie', async () => {
    expect((await request(app).post('/auth/logout')).status).toBe(204);
  });

  it('only logs out the current device', async () => {
    const { token: laptop } = await signup();
    const phone = cookieValue(await request(app).post('/auth/login').send(creds));
    await request(app).post('/auth/logout').set('Cookie', `refresh_token=${laptop}`);
    expect((await refresh(phone)).status).toBe(200);
  });

  it('logout-all revokes every device', async () => {
    const { token: laptop, accessToken } = await signup();
    const phone = cookieValue(await request(app).post('/auth/login').send(creds));
    const res = await request(app).post('/auth/logout-all').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(204);
    expect((await refresh(laptop)).status).toBe(401);
    expect((await refresh(phone)).status).toBe(401);
  });

  it('logout-all requires an access token', async () => {
    expect((await request(app).post('/auth/logout-all')).status).toBe(401);
  });
});
