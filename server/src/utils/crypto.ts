import { createHash, randomBytes } from 'node:crypto';

/** 256 bits of randomness, URL-safe (fits in cookies and email links). */
export const generateToken = () => randomBytes(32).toString('base64url');

// SHA-256 is fine here (unlike for passwords): the token is 256 bits of randomness,
// so there's nothing to brute-force. Passwords need slow hashes because humans pick weak ones.
export const hashToken = (raw: string) => createHash('sha256').update(raw).digest('hex');
