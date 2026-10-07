import type { Role, UserDoc } from '../models/User.js';

// Teach TypeScript what our middleware adds to `req`.
declare global {
  namespace Express {
    interface Request {
      /** Set by requireAuth, from the JWT. Cheap, but up to 15 minutes stale. */
      user?: { id: string; role: Role };
      /** Set by loadCurrentUser, fresh from the database. */
      currentUser?: UserDoc;
    }
  }
}

export {};
