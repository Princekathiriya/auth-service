import { UserModel, type UserDoc } from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { revokeAllForUser } from './session.service.js';
import type { GoogleProfile } from './google.js';

/**
 * Turn a verified Google profile into one of our users. Three cases:
 * 1. Seen this Google account before        -> that user.
 * 2. New Google account, email already used -> link it to the existing user.
 * 3. Neither                                -> create a user (no password).
 */
export async function findOrCreateGoogleUser(profile: GoogleProfile): Promise<UserDoc> {
  // If Google hasn't verified the address, we can't trust that this person owns it,
  // so it must not be used to log into (or link to) an account with that email.
  if (!profile.emailVerified) {
    throw new AppError(403, 'Your Google email address is not verified', 'OAUTH_EMAIL_UNVERIFIED');
  }

  const byGoogleId = await UserModel.findOne({ googleId: profile.googleId });
  if (byGoogleId) return byGoogleId;

  const byEmail = await UserModel.findOne({ email: profile.email });
  if (byEmail) {
    const update: Record<string, unknown> = { $set: { googleId: profile.googleId, emailVerified: true } };
    if (!byEmail.emailVerified) {
      // "Pre-account hijacking": an attacker registers victim@gmail.com with their own
      // password, but can't verify it. Later the real owner signs in with Google. If we
      // simply linked, the attacker's password would still work. So when the existing
      // account was never verified, we drop its password and kill its sessions.
      update.$unset = { passwordHash: 1 };
      await revokeAllForUser(byEmail.id);
    }
    const linked = await UserModel.findByIdAndUpdate(byEmail.id, update, { returnDocument: 'after' });
    return linked!;
  }

  try {
    return await UserModel.create({
      email: profile.email,
      name: profile.name.slice(0, 100),
      googleId: profile.googleId,
      emailVerified: true,
    });
  } catch (err) {
    // Two callbacks for the same new Google user at once: the unique index lets only one
    // insert win. The loser just picks up the user the winner created.
    if ((err as { code?: number }).code === 11000) {
      const existing = await UserModel.findOne({ googleId: profile.googleId });
      if (existing) return existing;
    }
    throw err;
  }
}
