#!/usr/bin/env bash
set -euo pipefail

: "${ADMIN_PASSWORD:?ADMIN_PASSWORD is required}"
: "${SESSION_SECRET:?SESSION_SECRET is required}"

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_PORT="${DEPLOY_PORT:-4006}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"

cd "$APP_DIR"

mkdir -p server/data server/uploads server/logs
if [ -d server/data ]; then
  backup_dir="${HOME}/backups/daifaxitong"
  mkdir -p "$backup_dir"
  backup_file="${backup_dir}/data-$(date +%Y%m%d-%H%M%S).tar.gz"
  tar -czf "$backup_file" server/data
  ls -lh "$backup_file"
fi

cat > .env <<ENV
PORT=${DEPLOY_PORT}
DATABASE_PATH=server/data/daifa.sqlite
ADMIN_USERNAME=${ADMIN_USERNAME}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
SESSION_SECRET=${SESSION_SECRET}
DINGTALK_WEBHOOK=${DINGTALK_WEBHOOK:-}
DINGTALK_SECRET=${DINGTALK_SECRET:-}
RETURN_DINGTALK_WEBHOOK=${RETURN_DINGTALK_WEBHOOK:-}
RETURN_DINGTALK_SECRET=${RETURN_DINGTALK_SECRET:-}
FEISHU_WEBHOOK=${FEISHU_WEBHOOK:-}
FEISHU_SECRET=${FEISHU_SECRET:-}
KUAIDI100_CUSTOMER=${KUAIDI100_CUSTOMER:-}
KUAIDI100_KEY=${KUAIDI100_KEY:-}
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

for attempt in {1..15}; do
  if curl -fsS "http://127.0.0.1:${DEPLOY_PORT}/api/health" >/dev/null; then
    echo "Deployment complete: http://127.0.0.1:${DEPLOY_PORT}"
    exit 0
  fi
  echo "Waiting for service on port ${DEPLOY_PORT} (${attempt}/15)..."
  sleep 2
done

echo "Deployment failed: service did not respond on port ${DEPLOY_PORT}" >&2
exit 1
