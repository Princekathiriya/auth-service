import { z } from 'zod';
import { ROLES } from '../../models/User.js';

// Validate ids BEFORE they reach Mongoose. Otherwise "/users/abc" makes Mongoose throw a CastError.
export const userIdParams = z.object({ id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid user id') });

export const listUsersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  // Always cap page size. Without a max, ?limit=1000000 dumps the whole collection.
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().toLowerCase().min(1).max(100).optional(),
  role: z.enum(ROLES).optional(),
});

export const changeRoleBody = z.object({ role: z.enum(ROLES) });

export type ListUsersQuery = z.infer<typeof listUsersQuery>;
