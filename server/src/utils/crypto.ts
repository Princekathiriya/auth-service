import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** 256 bits of randomness, URL-safe (fits in cookies and email links). */
export const generateToken = () => randomBytes(32).toString('base64url');

// SHA-256 is fine here (unlike for passwords): the token is 256 bits of randomness,
// so there's nothing to brute-force. Passwords need slow hashes because humans pick weak ones.
export const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');

/** Compare secrets in constant time, so response timing doesn't reveal how many characters matched. */
export function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
