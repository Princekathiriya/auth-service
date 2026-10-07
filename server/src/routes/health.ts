import { Router } from 'express';

export const healthRouter = Router();

// Used by Docker / Render health checks and uptime monitors.
healthRouter.get('/', (_req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});
