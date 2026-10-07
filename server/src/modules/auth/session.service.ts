import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { RefreshTokenModel } from '../../models/RefreshToken.js';
import { UserModel } from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';

export interface ClientMeta {
  userAgent?: string;
  ip?: string;
}

// If a just-rotated token shows up again within this window, it's almost certainly
// two tabs (or React StrictMode) refreshing at the same moment, not an attacker.
export const REUSE_GRACE_MS = 10_000;

// SHA-256 is fine here (unlike for passwords): the token is 256 bits of randomness,
// so there's nothing to brute-force. Passwords need slow hashes because humans pick weak ones.
const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

const invalid = () => new AppError(401, 'Invalid refresh token', 'INVALID_REFRESH_TOKEN');

export async function createRefreshToken(userId: string, meta: ClientMeta, family: string = randomUUID()) {
  // Opaque random string, not a JWT: we must look it up in the DB anyway
  // (to revoke it), so a self-contained signed token would add nothing.
  const raw = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
  await RefreshTokenModel.create({
    userId,
    tokenHash: hashToken(raw),
    family,
    expiresAt,
    userAgent: meta.userAgent?.slice(0, 500),
    ip: meta.ip,
  });
  return { raw, expiresAt };
}

/**
 * Rotation: every refresh token works exactly once. Using it returns a new one
 * and kills the old one. If an old (already used) token is presented again,
 * someone copied it, so we revoke the whole family and both the thief and
 * the real user must log in again.
 */
export async function rotateRefreshToken(raw: string, meta: ClientMeta) {
  const tokenHash = hashToken(raw);
  const now = new Date();

  // Atomic "check and mark used" in ONE query. A separate find + update would let
  // two concurrent requests both see the token as unused and both get new tokens.
  const current = await RefreshTokenModel.findOneAndUpdate(
    { tokenHash, revokedAt: null, expiresAt: { $gt: now } },
    { $set: { revokedAt: now } },
  );

  if (!current) {
    const used = await RefreshTokenModel.findOne({ tokenHash });
    if (used?.revokedAt && now.getTime() - used.revokedAt.getTime() > REUSE_GRACE_MS) {
      logger.warn({ userId: String(used.userId), family: used.family }, 'Refresh token reuse detected; revoking session');
      await revokeFamily(used.family);
    }
    throw invalid();
  }

  const user = await UserModel.findById(current.userId);
  if (!user) throw invalid();

  const next = await createRefreshToken(user.id, meta, current.family);
  return { user, refreshToken: next };
}

export async function revokeFamily(family: string) {
  await RefreshTokenModel.updateMany({ family, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

/** Logout this device: revoke the session the given token belongs to. Never throws. */
export async function revokeSessionByToken(raw: string) {
  const token = await RefreshTokenModel.findOne({ tokenHash: hashToken(raw) });
  if (token) await revokeFamily(token.family);
}

/** "Log out everywhere": revoke every session of the user. */
export async function revokeAllForUser(userId: string) {
  await RefreshTokenModel.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}
