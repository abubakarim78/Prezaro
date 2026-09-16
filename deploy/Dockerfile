# Rollmark — production image (bun + Next standalone + SQLite)
# Build happens on the deploy machine: docker build (or docker compose build).

FROM oven/bun:1

WORKDIR /app

# 1. dependencies (cached until lockfile changes)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 2. app source + prisma client + production build
COPY . .
RUN bunx prisma generate
RUN bun run build

# 3. runtime plumbing
COPY deploy/entrypoint.sh /usr/local/bin/rollmark-entrypoint
COPY deploy/bootstrap.ts /app/bootstrap.ts
RUN chmod +x /usr/local/bin/rollmark-entrypoint

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

EXPOSE 3000

# Data lives in /app/db (mount a volume there):
#   - SQLite file   : /app/db/custom.db        (DATABASE_URL)
#   - JWT secret    : /app/db/.auth-secret     (auto-generated + persisted if AUTH_SECRET unset)
VOLUME ["/app/db"]

ENTRYPOINT ["rollmark-entrypoint"]
