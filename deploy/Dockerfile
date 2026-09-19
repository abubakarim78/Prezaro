# Prezaro — production image (bun + Next standalone)
# Build happens on the deploy machine: docker build (or Coolify/docker compose).

FROM oven/bun:1

# Install OpenSSL for Prisma client engine runtime support
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 1. dependencies (cached until lockfile changes)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 2. app source + prisma client + production build
COPY . .

# Stamp the service worker with a build-unique version so every published
# image is seen as an update by installed PWAs (update toast + cache
# refresh), even when sw.js itself did not change between releases.
RUN stamp="prezaro-$(date -u +%Y%m%d%H%M%S)" \
 && sed -i "s|const VERSION = '.*'|const VERSION = '${stamp}'|" public/sw.js

ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder?schema=public"
RUN bunx prisma generate
RUN bun run build

# 3. runtime plumbing
COPY deploy/entrypoint.sh /usr/local/bin/prezaro-entrypoint
COPY deploy/bootstrap.ts /app/bootstrap.ts
RUN chmod +x /usr/local/bin/prezaro-entrypoint

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

EXPOSE 3000

ENTRYPOINT ["prezaro-entrypoint"]
