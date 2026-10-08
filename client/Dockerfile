# ---------- Stage 1: build the static files ----------
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .

# Vite bakes VITE_* values into the JS at BUILD time (the browser can't read server env vars).
# So the API URL is a build argument: a different API URL means rebuilding the image.
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---------- Stage 2: serve with nginx (no Node at all in the final image) ----------
FROM nginxinc/nginx-unprivileged:1.29-alpine AS runtime
ARG VITE_API_URL=http://localhost:4000
ENV API_URL=$VITE_API_URL
# Files in templates/ get ${VARS} substituted at container start and are written to conf.d/
# (only variables that exist in the environment, so nginx's own $uri etc. are left alone).
COPY nginx/default.conf /etc/nginx/templates/default.conf.template
COPY nginx/security-headers.conf /etc/nginx/templates/snippets/security-headers.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
