#!/usr/bin/env bash
set -u

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="$(awk -F= '$1 == "PORT" { print $2 }' "$APP_DIR/.env" 2>/dev/null | tail -n 1)"
PORT="${PORT:-4006}"
HEALTH_URL="http://127.0.0.1:${PORT}/api/health"
LOG_FILE="$APP_DIR/server/logs/health-watchdog.log"

mkdir -p "$(dirname "$LOG_FILE")"

for _attempt in 1 2 3; do
  if curl -fsS --max-time 8 "$HEALTH_URL" >/dev/null; then
    exit 0
  fi
  sleep 5
done

{
  printf '%s health check failed, restarting daifaxitong\n' "$(date '+%Y-%m-%d %H:%M:%S')"
  if command -v pm2 >/dev/null 2>&1; then
    cd "$APP_DIR"
    pm2 restart daifaxitong --update-env
    pm2 save || true
  else
    printf '%s pm2 command not found\n' "$(date '+%Y-%m-%d %H:%M:%S')"
  fi
} >>"$LOG_FILE" 2>&1
