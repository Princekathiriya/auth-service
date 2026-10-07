import { SignJWT, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import type { Role } from '../models/User.js';

const secret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const ISSUER = 'auth-service';
const AUDIENCE = 'auth-service-api';

export interface AccessTokenPayload {
  sub: string; // user id
  role: Role;
}

// Access token: short-lived (15m), sent in the Authorization header.
// Keep the payload minimal: it is only base64-encoded, NOT encrypted. Anyone can read it.
export function signAccessToken(payload: AccessTokenPayload) {
  return new SignJWT({ role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(secret);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  // Pinning algorithms prevents "alg: none" / algorithm-confusion attacks.
  const { payload } = await jwtVerify(token, secret, { algorithms: ['HS256'], issuer: ISSUER, audience: AUDIENCE });
  return { sub: payload.sub as string, role: payload.role as Role };
}
