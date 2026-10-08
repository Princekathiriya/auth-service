# ---------- Stage 1: build (has TypeScript and all dev tools) ----------
# slim (Debian) rather than alpine: argon2 ships native binaries, and glibc is the safe bet.
FROM node:26-slim AS build
WORKDIR /app

# Copy ONLY the package files first. Docker caches each step, so as long as dependencies
# don't change, `npm ci` is skipped on rebuilds even when source code changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ---------- Stage 2: runtime (only what's needed to RUN) ----------
# The final image has no TypeScript, no test tools, no source code: smaller, and less to attack.
FROM node:26-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist

# Don't run as root: if someone breaks into the app, they don't own the container.
USER node
EXPOSE 4000

# Docker marks the container "unhealthy" if /health stops answering. Hosts like Render set PORT
# themselves, so read it instead of assuming 4000. slim has no curl,
# so use Node's built-in fetch.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 4000) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

# `node` directly, NOT `npm start`: npm doesn't pass SIGTERM on to the app, so our graceful
# shutdown (finish in-flight requests, close DB) would never run on `docker stop`.
CMD ["node", "dist/server.js"]
