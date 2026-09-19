#!/bin/sh
# Prezaro container entrypoint: sync schema -> bootstrap admin -> serve.
set -e

mkdir -p /app/db

echo "[prezaro] syncing database schema..."
max_retries=30
count=0
until bunx prisma db push --skip-generate || [ $count -ge $max_retries ]; do
  count=$((count + 1))
  echo "[prezaro] waiting for database connection ($count/$max_retries)..."
  sleep 2
done

if [ $count -ge $max_retries ]; then
  echo "[prezaro] ERROR: Could not connect to database after $max_retries attempts."
  exit 1
fi
echo "[prezaro] database ready."

bun /app/bootstrap.ts

echo "[prezaro] starting server on port ${PORT:-3000}..."
exec bun .next/standalone/server.js
