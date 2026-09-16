#!/bin/sh
# Rollmark container entrypoint: sync schema -> bootstrap admin -> serve.
set -e

mkdir -p /app/db

echo "[rollmark] syncing database schema..."
bunx prisma db push --accept-data-loss --skip-generate
echo "[rollmark] database ready."

bun /app/bootstrap.ts

echo "[rollmark] starting server on port ${PORT:-3000}..."
exec bun .next/standalone/server.js
