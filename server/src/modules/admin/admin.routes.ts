import { Router } from 'express';
import { requireAuth } from '../../middleware/requireAuth.js';
import { loadCurrentUser, requireRole, requireVerified } from '../../middleware/authorize.js';
import { changeRoleBody, listUsersQuery, userIdParams } from './admin.schemas.js';
import * as admin from './admin.service.js';

export const adminRouter = Router();

// One line protects every route below it, so a new admin route can't be added "unprotected" by accident.
// Order matters: who are you (JWT) → load fresh user → email verified → is admin.
adminRouter.use(requireAuth, loadCurrentUser, requireVerified, requireRole('admin'));

adminRouter.get('/users', async (req, res) => {
  res.json(await admin.listUsers(listUsersQuery.parse(req.query)));
});

adminRouter.get('/users/:id', async (req, res) => {
  const { id } = userIdParams.parse(req.params);
  res.json({ user: await admin.getUser(id) });
});

adminRouter.patch('/users/:id/role', async (req, res) => {
  const { id } = userIdParams.parse(req.params);
  const { role } = changeRoleBody.parse(req.body);
  res.json({ user: await admin.changeRole(req.currentUser!.id, id, role) });
});

adminRouter.delete('/users/:id', async (req, res) => {
  const { id } = userIdParams.parse(req.params);
  await admin.deleteUser(req.currentUser!.id, id);
  res.status(204).end();
});
