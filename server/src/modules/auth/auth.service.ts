import argon2 from 'argon2';
import { UserModel, type UserDoc } from '../../models/User.js';
import { AppError } from '../../utils/AppError.js';
import { signAccessToken } from '../../utils/tokens.js';
import { createRefreshToken, type ClientMeta } from './session.service.js';
import type { LoginInput, RegisterInput } from './auth.schemas.js';

// Hash of a random string, computed once. Used when the email doesn't exist so
// login takes the same time either way (see login()).
const dummyHashPromise = argon2.hash('not-a-real-password-' + Math.random());

export async function issueTokens(user: UserDoc, meta: ClientMeta, refreshToken?: { raw: string; expiresAt: Date }) {
  const accessToken = await signAccessToken({ sub: user.id, role: user.role });
  // A new login starts a new session (refresh-token family); a refresh passes in the rotated token.
  const refresh = refreshToken ?? (await createRefreshToken(user.id, meta));
  return { user: user.toJSON(), accessToken, refreshToken: refresh };
}

export async function register(input: RegisterInput, meta: ClientMeta) {
  // argon2id is the current OWASP recommendation; salt is generated and stored inside the hash string.
  const passwordHash = await argon2.hash(input.password);
  try {
    const user = await UserModel.create({ email: input.email, name: input.name, passwordHash });
    return issueTokens(user, meta);
  } catch (err) {
    // E11000 = unique index violation. Checking "does the email exist?" first would
    // still race with a concurrent signup; letting the DB decide is race-free.
    if ((err as { code?: number }).code === 11000) {
      throw new AppError(409, 'An account with this email already exists', 'EMAIL_TAKEN');
    }
    throw err;
  }
}

export async function login(input: LoginInput, meta: ClientMeta) {
  const user = await UserModel.findOne({ email: input.email }).select('+passwordHash');

  // Always run a verify, even for unknown emails. Otherwise "unknown email"
  // answers in ~1ms and "wrong password" in ~50ms, and an attacker can use the
  // timing difference to discover which emails have accounts.
  const hash = user?.passwordHash ?? (await dummyHashPromise);
  const valid = await argon2.verify(hash, input.password);

  if (!user || !user.passwordHash || !valid) {
    // Same message for both cases, for the same reason.
    throw new AppError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }
  return issueTokens(user, meta);
}

export async function getUserById(id: string) {
  const user = await UserModel.findById(id);
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  return user.toJSON();
}
