import { pino } from 'pino';
import { env, isProd } from '../config/env.js';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  // Never let secrets reach the logs, even by accident.
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  // Pretty output locally; plain JSON in production so log tools can parse it.
  ...(isProd ? {} : { transport: { target: 'pino-pretty' } }),
});
