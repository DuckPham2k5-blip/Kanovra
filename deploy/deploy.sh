#!/usr/bin/env bash
#
# TaskForge — zero-downtime deploy for a Hostinger VPS.
#
# Run on the server, from the app directory:
#   cd /var/www/taskforge && ./deploy/deploy.sh
#
# Assumes: git remote configured, Node 20+, npm, pm2 and postgres available,
# and a populated .env file alongside this repo.

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/taskforge}"
BRANCH="${BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
PM2_APP="${PM2_APP:-taskforge}"

log()  { printf '\033[1;34m→ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$APP_DIR" || die "Không tìm thấy thư mục $APP_DIR"
[ -f .env ] || die "Thiếu file .env trong $APP_DIR"

PREVIOUS_SHA="$(git rev-parse HEAD)"
log "Bản hiện tại: $PREVIOUS_SHA"

# --- 1. Fetch -----------------------------------------------------------------
log "Kéo mã mới từ origin/$BRANCH"
git fetch --prune origin "$BRANCH"
git reset --hard "origin/$BRANCH"

# --- 2. Dependencies ----------------------------------------------------------
log "Cài dependencies"
npm ci --omit=dev --ignore-scripts
# The postinstall hook was skipped above; run the client generation explicitly
# so it uses the schema we just pulled.
npx prisma generate

# --- 3. Migrations ------------------------------------------------------------
log "Áp dụng migration"
npx prisma migrate deploy

# --- 4. Build -----------------------------------------------------------------
# devDependencies are needed to compile, so install the full tree, build, then
# prune back down.
log "Build ứng dụng"
npm ci
npm run build
npm prune --omit=dev

# The standalone bundle does not include static assets or public/.
log "Sao chép static assets vào bundle standalone"
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
[ -d public ] && cp -r public .next/standalone/public
cp .env .next/standalone/.env

# --- 5. Reload ----------------------------------------------------------------
if pm2 describe "$PM2_APP" >/dev/null 2>&1; then
  log "Reload PM2 (không gián đoạn)"
  pm2 reload ecosystem.config.js --env production --update-env
else
  log "Khởi động PM2 lần đầu"
  pm2 start ecosystem.config.js --env production
fi
pm2 save

# --- 6. Health check ----------------------------------------------------------
log "Kiểm tra health endpoint"
for attempt in $(seq 1 15); do
  if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then
    ok "Deploy thành công — $(git rev-parse --short HEAD)"
    exit 0
  fi
  sleep 2
  printf '  … lần thử %s/15\n' "$attempt"
done

# --- 7. Rollback --------------------------------------------------------------
printf '\033[1;31m✘ Health check thất bại, đang rollback về %s\033[0m\n' "$PREVIOUS_SHA" >&2
git reset --hard "$PREVIOUS_SHA"
npm ci
npm run build
mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
[ -d public ] && cp -r public .next/standalone/public
cp .env .next/standalone/.env
pm2 reload ecosystem.config.js --env production --update-env
die "Đã rollback. Kiểm tra log: pm2 logs $PM2_APP"
