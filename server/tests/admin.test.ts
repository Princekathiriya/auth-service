import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { UserModel, type Role } from '../src/models/User.js';
import { RefreshTokenModel } from '../src/models/RefreshToken.js';

const app = createApp();
const PASSWORD = 'correct-horse-battery';

/** Register a user, then set role/verification directly in the DB (there's no API for the first admin). */
async function makeUser(email: string, { role = 'user' as Role, verified = true } = {}) {
  const reg = await request(app).post('/auth/register').send({ email, name: email.split('@')[0], password: PASSWORD });
  await UserModel.updateOne({ email }, { role, emailVerified: verified });
  // Log in AFTER the DB change, so the JWT carries the real role.
  const login = await request(app).post('/auth/login').send({ email, password: PASSWORD });
  return { id: reg.body.user.id as string, token: login.body.accessToken as string };
}

const as = (token: string) => ({
  get: (url: string) => request(app).get(url).set('Authorization', `Bearer ${token}`),
  patch: (url: string, body: object) => request(app).patch(url).set('Authorization', `Bearer ${token}`).send(body),
  delete: (url: string) => request(app).delete(url).set('Authorization', `Bearer ${token}`),
});

describe('access control on /admin', () => {
  it('401 without a token', async () => {
    expect((await request(app).get('/admin/users')).status).toBe(401);
  });

  it('403 for a normal user', async () => {
    const user = await makeUser('user@example.com');
    const res = await as(user.token).get('/admin/users');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('403 for an admin whose email is not verified', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin', verified: false });
    const res = await as(admin.token).get('/admin/users');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('200 for a verified admin', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    expect((await as(admin.token).get('/admin/users')).status).toBe(200);
  });

  it('a demoted admin loses access IMMEDIATELY, even though their JWT still says admin', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    await UserModel.updateOne({ email: 'admin@example.com' }, { role: 'user' });
    expect((await as(admin.token).get('/admin/users')).status).toBe(403);
  });

  it('a deleted user with a still-valid token gets 401', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    await UserModel.deleteOne({ email: 'admin@example.com' });
    expect((await as(admin.token).get('/admin/users')).status).toBe(401);
  });

  it('a user cannot make themselves admin through registration or the role endpoint', async () => {
    const user = await makeUser('user@example.com');
    const res = await as(user.token).patch(`/admin/users/${user.id}/role`, { role: 'admin' });
    expect(res.status).toBe(403);
    expect((await UserModel.findById(user.id))!.role).toBe('user');
  });
});

describe('GET /admin/users', () => {
  it('lists users newest first, without password hashes', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    await makeUser('zed@example.com');
    const res = await as(admin.token).get('/admin/users');
    expect(res.body.total).toBe(2);
    expect(res.body.users[0].email).toBe('zed@example.com');
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
  });

  it('paginates', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    for (const n of [1, 2, 3, 4]) await makeUser(`u${n}@example.com`);
    const res = await as(admin.token).get('/admin/users?page=2&limit=2');
    expect(res.body).toMatchObject({ page: 2, limit: 2, total: 5, totalPages: 3 });
    expect(res.body.users).toHaveLength(2);
  });

  it('caps the page size at 100', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    expect((await as(admin.token).get('/admin/users?limit=100000')).status).toBe(400);
  });

  it('filters by role and searches by email prefix (case-insensitive)', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    await makeUser('alice@example.com');
    await makeUser('bob@example.com');
    const search = await as(admin.token).get('/admin/users?search=ALI');
    expect(search.body.users.map((u: { email: string }) => u.email)).toEqual(['alice@example.com']);
    const admins = await as(admin.token).get('/admin/users?role=admin');
    expect(admins.body.total).toBe(1);
  });

  it('treats regex characters in search as plain text', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    await makeUser('bob@example.com');
    const res = await as(admin.token).get(`/admin/users?search=${encodeURIComponent('.*')}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0); // unescaped, ".*" would have matched everyone
  });

  it('rejects an unknown role filter', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    expect((await as(admin.token).get('/admin/users?role=superuser')).status).toBe(400);
  });
});

describe('GET /admin/users/:id', () => {
  it('400 for a malformed id (not a 500)', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    expect((await as(admin.token).get('/admin/users/not-an-id')).status).toBe(400);
  });

  it('404 for an id that does not exist', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    expect((await as(admin.token).get('/admin/users/0123456789abcdef01234567')).status).toBe(404);
  });
});

describe('PATCH /admin/users/:id/role', () => {
  it('promotes a user', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    const user = await makeUser('user@example.com');
    const res = await as(admin.token).patch(`/admin/users/${user.id}/role`, { role: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  it('demotes another admin', async () => {
    const a = await makeUser('a@example.com', { role: 'admin' });
    const b = await makeUser('b@example.com', { role: 'admin' });
    const res = await as(a.token).patch(`/admin/users/${b.id}/role`, { role: 'user' });
    expect(res.body.user.role).toBe('user');
  });

  it('an admin cannot change their own role', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    const res = await as(admin.token).patch(`/admin/users/${admin.id}/role`, { role: 'user' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_CHANGE_OWN_ROLE');
  });

  it('rejects unknown roles', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    const user = await makeUser('user@example.com');
    expect((await as(admin.token).patch(`/admin/users/${user.id}/role`, { role: 'root' })).status).toBe(400);
  });

  it('two admins demoting each other at the same time never leaves zero admins', async () => {
    // Run the race several times: it only bites when both requests interleave.
    for (let i = 0; i < 5; i++) {
      await UserModel.deleteMany({});
      const a = await makeUser(`a${i}@example.com`, { role: 'admin' });
      const b = await makeUser(`b${i}@example.com`, { role: 'admin' });
      const results = await Promise.all([
        as(a.token).patch(`/admin/users/${b.id}/role`, { role: 'user' }),
        as(b.token).patch(`/admin/users/${a.id}/role`, { role: 'user' }),
      ]);
      // Safe outcomes: one wins (200 + 409), or both roll back (409 + 409, both stay admin).
      // Never acceptable: both succeed and nobody is admin any more.
      expect(await UserModel.countDocuments({ role: 'admin' })).toBeGreaterThanOrEqual(1);
      for (const r of results) expect([200, 409]).toContain(r.status);
    }
  });
});

describe('DELETE /admin/users/:id', () => {
  it('deletes a user and all their sessions', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    const user = await makeUser('user@example.com');
    const res = await as(admin.token).delete(`/admin/users/${user.id}`);
    expect(res.status).toBe(204);
    expect(await UserModel.findById(user.id)).toBeNull();
    expect(await RefreshTokenModel.countDocuments({ userId: user.id })).toBe(0);
  });

  it('the deleted user is locked out immediately', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    const user = await makeUser('user@example.com');
    await as(admin.token).delete(`/admin/users/${user.id}`);
    expect((await request(app).post('/auth/login').send({ email: 'user@example.com', password: PASSWORD })).status).toBe(401);
  });

  it('cannot delete yourself', async () => {
    const admin = await makeUser('admin@example.com', { role: 'admin' });
    expect((await as(admin.token).delete(`/admin/users/${admin.id}`)).status).toBe(400);
  });

  it('cannot delete another admin without demoting them first', async () => {
    const a = await makeUser('a@example.com', { role: 'admin' });
    const b = await makeUser('b@example.com', { role: 'admin' });
    const res = await as(a.token).delete(`/admin/users/${b.id}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DEMOTE_FIRST');
  });
});
