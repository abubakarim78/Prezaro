#!/bin/sh
# ClassCheck container entrypoint: sync schema -> bootstrap admin -> serve.
set -e

mkdir -p /app/db

echo "[classcheck] syncing database schema..."
bunx prisma db push --accept-data-loss --skip-generate
echo "[classcheck] database ready."

bun /app/bootstrap.ts

echo "[classcheck] starting server on port ${PORT:-3000}..."
exec bun .next/standalone/server.js
