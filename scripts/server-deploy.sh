#!/usr/bin/env bash
set -euo pipefail

: "${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}"
: "${SESSION_SECRET:?SESSION_SECRET is required}"

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_PORT="${DEPLOY_PORT:-4006}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"

cd "$APP_DIR"

mkdir -p server/data server/uploads server/logs

cat > .env <<ENV
PORT=${DEPLOY_PORT}
DATABASE_PATH=server/data/daifa.sqlite
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
SESSION_SECRET=${SESSION_SECRET}
ENV

npm ci
npm run db:init
npm run build

if command -v pm2 >/dev/null 2>&1; then
  PM2=(pm2)
else
  PM2=(npx --yes pm2)
fi

"${PM2[@]}" startOrReload ecosystem.config.cjs --env production
"${PM2[@]}" save || true

curl -fsS "http://127.0.0.1:${DEPLOY_PORT}/api/health" >/dev/null
echo "Deployment complete: http://127.0.0.1:${DEPLOY_PORT}"
