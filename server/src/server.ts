import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { connectDB, disconnectDB } from './config/db.js';

// Connect to the DB BEFORE accepting traffic; if it fails, crash loudly.
await connectDB(env.MONGODB_URI);

const server = createApp().listen(env.PORT, () => {
  logger.info(`Auth service listening on port ${env.PORT}`);
});

// Graceful shutdown: Docker/Render send SIGTERM on redeploy. Stop accepting
// new connections, let in-flight requests finish, then exit.
function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(async () => {
    await disconnectDB();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref(); // force-exit if something hangs
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
