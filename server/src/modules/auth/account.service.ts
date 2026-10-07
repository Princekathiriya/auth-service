import argon2 from 'argon2';
import { EmailTokenModel, type EmailTokenType } from '../../models/EmailToken.js';
import { UserModel, type UserDoc } from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { generateToken, hashToken } from '../../utils/crypto.js';
import { logger } from '../../utils/logger.js';
import { sendInBackground } from '../email/mailer.js';
import { resetPasswordMessage, verifyEmailMessage } from '../email/templates.js';
import { revokeAllForUser } from './session.service.js';
import type { ResetPasswordInput } from './auth.schemas.js';

const TTL_MS: Record<EmailTokenType, number> = {
  verify_email: 24 * 60 * 60 * 1000, // 24 hours: low risk, people check email late
  reset_password: 30 * 60 * 1000, // 30 minutes: high risk, it grants account access
};

async function createEmailToken(userId: string, type: EmailTokenType) {
  // Only the newest link works: requesting a new one invalidates older ones.
  await EmailTokenModel.deleteMany({ userId, type });
  const raw = generateToken();
  await EmailTokenModel.create({ userId, type, tokenHash: hashToken(raw), expiresAt: new Date(Date.now() + TTL_MS[type]) });
  return raw;
}

/** Atomically find-and-delete, so a token can be used exactly once even under concurrent requests. */
async function consumeEmailToken(raw: string, type: EmailTokenType) {
  const token = await EmailTokenModel.findOneAndDelete({ tokenHash: hashToken(raw), type, expiresAt: { $gt: new Date() } });
  if (!token) throw new AppError(400, 'This link is invalid or has expired', 'INVALID_TOKEN');
  return String(token.userId);
}

export async function sendVerificationEmail(user: UserDoc) {
  const token = await createEmailToken(user.id, 'verify_email');
  sendInBackground(verifyEmailMessage(user.email, user.name, token));
}

export async function verifyEmail(raw: string) {
  const userId = await consumeEmailToken(raw, 'verify_email');
  const user = await UserModel.findByIdAndUpdate(userId, { emailVerified: true }, { returnDocument: 'after' });
  if (!user) throw new AppError(400, 'This link is invalid or has expired', 'INVALID_TOKEN');
  return user.toJSON();
}

export async function resendVerification(userId: string) {
  const user = await UserModel.findById(userId);
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  if (user.emailVerified) throw new AppError(409, 'Email is already verified', 'ALREADY_VERIFIED');
  await sendVerificationEmail(user);
}

/**
 * Called in the background AFTER the response is sent, so the response is the same
 * (and takes the same time) whether or not the email belongs to an account.
 */
export async function requestPasswordReset(email: string) {
  const user = await UserModel.findOne({ email });
  if (!user) return; // silently do nothing
  const token = await createEmailToken(user.id, 'reset_password');
  sendInBackground(resetPasswordMessage(user.email, user.name, token));
}

export function requestPasswordResetInBackground(email: string) {
  requestPasswordReset(email).catch((err: unknown) => logger.error({ err }, 'Password reset request failed'));
}

export async function resetPassword({ token, password }: ResetPasswordInput) {
  const userId = await consumeEmailToken(token, 'reset_password');
  const passwordHash = await argon2.hash(password);
  // Clicking a link sent to the inbox proves they own the address, so mark it verified too.
  const user = await UserModel.findByIdAndUpdate(userId, { passwordHash, emailVerified: true });
  if (!user) throw new AppError(400, 'This link is invalid or has expired', 'INVALID_TOKEN');
  // If the password was reset because the account was compromised, the attacker's
  // sessions must die too. Everyone (including the real user) logs in again.
  await revokeAllForUser(userId);
}
