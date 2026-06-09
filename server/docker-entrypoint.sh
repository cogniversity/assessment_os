#!/bin/sh
set -e
cd /app/server
echo "Generating Prisma client..."
npx prisma generate
echo "Running database migrations..."
if [ "${DB_RESET_ON_START:-false}" = "true" ]; then
  echo "DB_RESET_ON_START=true — resetting database and reapplying migrations..."
  npx prisma migrate reset --force --skip-seed
fi
npx prisma migrate deploy
if [ "${RUN_DB_SEED:-false}" = "true" ]; then
  echo "Seeding database..."
  npm run db:seed
  echo "Seed completed successfully."
fi
exec node dist/index.js
