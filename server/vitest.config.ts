import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    hookTimeout: 60_000, // first run downloads a MongoDB binary
    // Tests get a fixed, valid env so config validation passes without a real .env file.
    env: {
      NODE_ENV: 'test',
      PORT: '0',
      CLIENT_ORIGIN: 'http://localhost:5173',
      MONGODB_URI: 'mongodb://placeholder-replaced-by-setup',
      JWT_ACCESS_SECRET: 'test-secret-that-is-at-least-32-characters-long',
      JWT_ACCESS_TTL: '15m',
      EMAIL_PROVIDER: 'console',
      GOOGLE_CLIENT_ID: 'test-client-id.apps.googleusercontent.com',
      GOOGLE_CLIENT_SECRET: 'test-client-secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:4000/auth/google/callback',
    },
  },
});
