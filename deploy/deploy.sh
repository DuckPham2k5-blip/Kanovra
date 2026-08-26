#!/usr/bin/env bash
#
# Kanovra — zero-downtime deploy for a Hostinger VPS.
#
# Run on the server, from the app directory:
#   cd /var/www/kanovra && ./deploy/deploy.sh
#
# Assumes: git remote configured, Node 20+, npm, pm2 and postgres available,
# and a populated .env file alongside this repo.

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/kanovra}"
BRANCH="${BRANCH:-main}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:3000/api/health}"
PM2_APP="${PM2_APP:-kanovra}"

log()  { printf '\033[1;34m→ %s\033[0m\n' "$*"; }
ok()   { printf '\033[1;32m✔ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✘ %s\033[0m\n' "$*" >&2; exit 1; }

cd "$APP_DIR" || die "Không tìm thấy thư mục $APP_DIR"
[ -f .env ] || die "Thiếu file .env trong $APP_DIR"

PREVIOUS_SHA="$(git rev-parse HEAD)"
log "Bản hiện tại: $PREVIOUS_SHA"

# --- 1. Fetch -----------------------------------------------------------------
# Hỏi trước khi kéo. `git fetch` vào một repo rỗng báo lỗi khó hiểu, mà repo
# rỗng là đúng tình trạng của origin lúc script này được viết ra — mã nguồn
# chưa từng được đẩy lên đâu cả.
if ! git ls-remote --exit-code --heads origin "$BRANCH" >/dev/null 2>&1; then
  die "origin không có nhánh '$BRANCH'.
    Có thể là repo còn rỗng (chưa push lần nào), hoặc origin trỏ sai chỗ,
    hoặc máy này không có quyền đọc nó. Kiểm tra bằng:
      git -C $APP_DIR remote -v
      git -C $APP_DIR ls-remote --heads origin"
fi

log "Kéo mã mới từ origin/$BRANCH"
git fetch --prune origin "$BRANCH"
git reset --hard "origin/$BRANCH"

# --- 2. Dependencies ----------------------------------------------------------
# Một lần cài duy nhất, đủ cả devDependencies vì `next build` cần chúng.
#
# Trước đây chỗ này có thêm một lần `npm ci --omit=dev --ignore-scripts` đứng
# trước, rồi `npx prisma generate`, rồi mới tới `npm ci` đầy đủ ở bước build.
# Toàn bộ phần đó là công toi: `npm ci` XOÁ SẠCH node_modules trước khi cài (đã
# kiểm bằng cách để lại một file đánh dấu trong node_modules rồi chạy `npm ci`
# và thấy nó biến mất), nên cả cây phụ thuộc vừa cài lẫn prisma client vừa sinh
# ra đều bị lần cài sau xoá đi. Trên một VPS nhỏ đó là nguyên một lần tải và
# biên dịch phụ thuộc bị vứt.
#
# postinstall trong package.json chạy `prisma generate`, nên client có sẵn ngay
# sau bước này — bước migration bên dưới không cần thêm gì.
log "Cài dependencies"
npm ci

# --- 3. Migrations ------------------------------------------------------------
log "Áp dụng migration"
npx prisma migrate deploy

# --- 4. Build -----------------------------------------------------------------
log "Build ứng dụng"
npm run build
# Cắt devDependencies đi sau khi đã biên dịch xong.
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
