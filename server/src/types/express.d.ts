import type { Role } from '../models/User.js';

// Teach TypeScript that requireAuth adds `req.user`.
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}

export {};
