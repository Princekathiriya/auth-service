import { UserModel, type Role } from '../../models/User.js';
import { RefreshTokenModel } from '../../models/RefreshToken.js';
import { EmailTokenModel } from '../../models/EmailToken.js';
import { AppError } from '../../utils/AppError.js';
import { logger } from '../../utils/logger.js';
import type { ListUsersQuery } from './admin.schemas.js';

// The search text goes into a regex. Unescaped, ".*" would match everything, and patterns
// like "(a+)+$" can take seconds to evaluate (ReDoS). Escaping makes it a literal string.
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function listUsers({ page, limit, search, role }: ListUsersQuery) {
  const filter: Record<string, unknown> = {};
  if (role) filter.role = role;
  // Anchored with ^ (prefix search), so MongoDB can use the email index instead of scanning everything.
  if (search) filter.email = { $regex: `^${escapeRegex(search)}` };

  // skip/limit is simple and fine for an admin page. It gets slow on very deep pages
  // (the DB still walks past every skipped document); big feeds use cursor pagination instead.
  const [users, total] = await Promise.all([
    UserModel.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
    UserModel.countDocuments(filter),
  ]);
  return { users: users.map((u) => u.toJSON()), page, limit, total, totalPages: Math.ceil(total / limit) };
}

export async function getUser(id: string) {
  const user = await UserModel.findById(id);
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  return user.toJSON();
}

export async function changeRole(actorId: string, targetId: string, role: Role) {
  // Admins can't change their own role: it prevents an admin locking themselves out
  // by accident, and means the system can never lose its last admin through self-demotion.
  if (actorId === targetId) throw new AppError(400, 'You cannot change your own role', 'CANNOT_CHANGE_OWN_ROLE');

  const before = await UserModel.findById(targetId);
  if (!before) throw new AppError(404, 'User not found', 'NOT_FOUND');
  if (before.role === role) return before.toJSON();

  // Conditional update: only applies if the role is still what we just read.
  // If someone changed it in between, we report a conflict instead of overwriting blindly.
  const updated = await UserModel.findOneAndUpdate({ _id: targetId, role: before.role }, { role }, { returnDocument: 'after' });
  if (!updated) throw new AppError(409, 'User was modified by someone else, try again', 'CONFLICT');

  // Race: admins A and B demote each other at the same moment. Each request sees "2 admins,
  // fine" and both succeed, leaving ZERO admins. So after demoting, re-count, and undo if
  // we just removed the last one. (A multi-document transaction would also solve this, but
  // needs a replica set; this check works on any MongoDB.)
  if (before.role === 'admin' && (await UserModel.countDocuments({ role: 'admin' })) === 0) {
    await UserModel.updateOne({ _id: targetId }, { role: 'admin' });
    throw new AppError(409, 'Cannot remove the last admin', 'LAST_ADMIN');
  }

  // Audit trail: who changed what. Production apps often store this in its own collection.
  logger.info({ audit: true, actorId, targetId, from: before.role, to: role }, 'User role changed');
  return updated.toJSON();
}

export async function deleteUser(actorId: string, targetId: string) {
  if (actorId === targetId) throw new AppError(400, 'You cannot delete your own account here', 'CANNOT_DELETE_SELF');
  const user = await UserModel.findById(targetId);
  if (!user) throw new AppError(404, 'User not found', 'NOT_FOUND');
  // Two steps on purpose: demoting first goes through the last-admin protection above.
  if (user.role === 'admin') throw new AppError(409, 'Demote this admin before deleting them', 'DEMOTE_FIRST');

  await UserModel.deleteOne({ _id: targetId });
  // Delete everything that points at the user, so no session or email link outlives the account.
  await Promise.all([RefreshTokenModel.deleteMany({ userId: targetId }), EmailTokenModel.deleteMany({ userId: targetId })]);
  logger.info({ audit: true, actorId, targetId, email: user.email }, 'User deleted');
}
