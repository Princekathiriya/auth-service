import { pino } from 'pino';
import { env, isProd } from '../config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  // Never let secrets reach the logs, even by accident.
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  // Pretty output for local dev; JSON lines everywhere else (production, Docker) so log tools can
  // parse them. Docker images don't install dev dependencies, so pretty there would crash.
  ...((env.LOG_FORMAT ?? (isProd ? 'json' : 'pretty')) === 'pretty' ? { transport: { target: 'pino-pretty' } } : {}),
});
