import { createHash } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import { env } from '../../config/env.js';
import { generateToken } from '../../utils/crypto.js';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

// Google's public signing keys. jose downloads and caches them, and re-fetches when Google rotates keys.
let googleKeys: JWTVerifyGetKey = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));

/** Tests use their own key pair instead of Google's. */
export function setGoogleKeys(keys: JWTVerifyGetKey) {
  googleKeys = keys;
}

export const isGoogleConfigured = () =>
  Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI);

export interface GoogleProfile {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string;
}

/**
 * Step 1 of the Authorization Code flow. Three random values protect it:
 * - state: ties Google's redirect back to THIS browser's login attempt (stops login CSRF,
 *   where an attacker tricks you into finishing a login into the attacker's account).
 * - PKCE code_verifier: we send only its SHA-256 (code_challenge) now and the verifier
 *   itself when exchanging the code. A stolen ?code=... is useless without it.
 * - nonce: Google copies it into the ID token, so an old ID token can't be replayed.
 */
export function createGoogleAuthRequest() {
  const state = generateToken();
  const codeVerifier = generateToken();
  const nonce = generateToken();
  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID!,
    redirect_uri: env.GOOGLE_REDIRECT_URI!,
    response_type: 'code',
    scope: 'openid email profile', // only what we need
    state,
    nonce,
    code_challenge: createHash('sha256').update(codeVerifier).digest('base64url'),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  return { url: `${AUTH_URL}?${params}`, state, codeVerifier, nonce };
}

/** Step 2: trade the one-time code for an ID token, then fully verify the ID token. */
export async function exchangeCodeForProfile(code: string, codeVerifier: string, nonce: string): Promise<GoogleProfile> {
  // Server-to-server call: the client secret never reaches the browser.
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      code_verifier: codeVerifier,
      client_id: env.GOOGLE_CLIENT_ID!,
      client_secret: env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: env.GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Google token exchange failed with ${res.status}`);
  const { id_token: idToken } = (await res.json()) as { id_token?: unknown };
  if (typeof idToken !== 'string') throw new Error('Google response had no id_token');

  // We got this token straight from Google over HTTPS, so the spec says checking the
  // signature is optional. We check everything anyway: it costs ~nothing and protects
  // us if a bug ever lets a token arrive another way.
  const { payload } = await jwtVerify(idToken, googleKeys, {
    algorithms: ['RS256'],
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: env.GOOGLE_CLIENT_ID!, // issued for OUR app, not some other app using Google login
  });
  if (payload.nonce !== nonce) throw new Error('ID token nonce mismatch');
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') throw new Error('ID token missing sub/email');

  const email = payload.email.toLowerCase();
  return {
    googleId: payload.sub,
    email,
    emailVerified: payload.email_verified === true,
    name: (typeof payload.name === 'string' && payload.name.trim()) || email.split('@')[0]!,
  };
}
