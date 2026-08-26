#!/usr/bin/env bash
#
# Chạy bản build production của Kanovra ngay trên máy này, dùng database dev
# đang có, để xem bản production thật sự trông thế nào trước khi deploy.
#
#   bash deploy/run-prod-local.sh
#   bash deploy/run-prod-local.sh /duong/dan/toi/.env     # dùng file .env khác
#
# Không sửa mã nguồn, không sửa database, không cần VPS. Dừng bằng:
#   docker stop kanovra-prod
#
# Khoá Clerk được đọc thẳng từ .env và truyền vào container; script không in
# giá trị nào ra màn hình.

set -uo pipefail
# Git Bash trên Windows tự biến /app/... thành C:\... trong tham số docker.
export MSYS_NO_PATHCONV=1

ENV_FILE="${1:-.env}"
IMAGE="${IMAGE:-kanovra:rehearsal}"
NAME="${NAME:-kanovra-prod}"
DB_CONTAINER="${DB_CONTAINER:-kanovra-db}"
DB_NAME="${DB_NAME:-taskforge}"
DB_USER="${DB_USER:-taskforge}"
DB_PASS="${DB_PASS:-taskforge}"

RED=$'\033[1;31m'; YEL=$'\033[1;33m'; GRN=$'\033[1;32m'; BLU=$'\033[1;34m'; OFF=$'\033[0m'
step() { printf '\n%s→ %s%s\n' "$BLU" "$*" "$OFF"; }
ok()   { printf '%s✔ %s%s\n' "$GRN" "$*" "$OFF"; }
warn() { printf '%s▲ %s%s\n' "$YEL" "$*" "$OFF"; }
die()  { printf '%s✘ %s%s\n' "$RED" "$*" "$OFF" >&2; exit 1; }

# --- 1. Công cụ và image -----------------------------------------------------
step "Kiểm tra Docker"
command -v docker >/dev/null 2>&1 || die "Không tìm thấy docker. Mở Docker Desktop trước."
docker info >/dev/null 2>&1 || die "Docker chưa chạy. Mở Docker Desktop rồi chờ nó xanh."
ok "Docker sẵn sàng"

docker image inspect "$IMAGE" >/dev/null 2>&1 || die "Chưa có image $IMAGE.
    Dựng nó bằng (mất khoảng 20-30 phút lần đầu):
      docker build --build-arg NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=\"\$(grep '^NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=' .env | cut -d= -f2- | tr -d '\"')\" --build-arg NEXT_PUBLIC_APP_URL=\"http://localhost:3100\" -t $IMAGE ."
ok "Đã có image $IMAGE"

# --- 2. Khoá Clerk -----------------------------------------------------------
step "Đọc khoá Clerk từ $ENV_FILE"
[ -f "$ENV_FILE" ] || die "Không có file $ENV_FILE. Chạy script từ thư mục gốc của dự án."

read_env() {  # $1 = tên biến; in ra giá trị đã bỏ ngoặc kép
  grep -E "^$1=" "$ENV_FILE" | head -1 | sed -E "s/^[^=]+=//; s/^[\"']//; s/[\"']$//" | tr -d '\r'
}
PK="$(read_env NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)"
SK="$(read_env CLERK_SECRET_KEY)"

[ -n "$PK" ] || die "Không đọc được NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY trong $ENV_FILE"
[ -n "$SK" ] || die "Không đọc được CLERK_SECRET_KEY trong $ENV_FILE"
case "$PK" in pk_test_*|pk_live_*) ;; *) die "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY không bắt đầu bằng pk_test_ hay pk_live_" ;; esac
case "$SK" in sk_test_*|sk_live_*) ;; *) die "CLERK_SECRET_KEY không bắt đầu bằng sk_test_ hay sk_live_" ;; esac
ok "Đọc được cả hai khoá (${PK:0:8}…, ${SK:0:8}…)"

# --- 3. Database -------------------------------------------------------------
step "Kiểm tra database"
if [ -z "$(docker ps -q -f "name=^${DB_CONTAINER}$")" ]; then
  if [ -n "$(docker ps -aq -f "name=^${DB_CONTAINER}$")" ]; then
    warn "$DB_CONTAINER đang tắt, đang bật lên"
    docker start "$DB_CONTAINER" >/dev/null || die "Không bật được $DB_CONTAINER"
  else
    die "Không có container $DB_CONTAINER. Chạy: docker compose up -d postgres"
  fi
fi
NETWORK="$(docker inspect "$DB_CONTAINER" --format '{{range $k,$v := .NetworkSettings.Networks}}{{$k}}{{end}}' 2>/dev/null)"
[ -n "$NETWORK" ] || die "Không đọc được mạng của $DB_CONTAINER"
ok "$DB_CONTAINER đang chạy trên mạng $NETWORK"

# --- 4. Cổng -----------------------------------------------------------------
step "Tìm cổng trống"
PORT=""
for p in 3100 3101 3102 3103 3104; do
  # /dev/tcp mở được nghĩa là đã có thứ gì đó nghe ở đó.
  if ! (exec 3<>"/dev/tcp/127.0.0.1/$p") 2>/dev/null; then PORT="$p"; break; fi
done
[ -n "$PORT" ] || die "Cổng 3100-3104 đều bận"
if [ "$PORT" != "3100" ]; then
  warn "3100 đang bận, dùng $PORT thay thế"
  warn "Image nhúng sẵn NEXT_PUBLIC_APP_URL=http://localhost:3100 lúc build, nên"
  warn "vài đường dẫn tuyệt đối có thể trỏ về 3100. Đăng nhập và xem thì vẫn ổn."
fi
ok "Dùng cổng $PORT"

# --- 5. Thư mục tệp đính kèm -------------------------------------------------
mkdir -p uploads
if HOST_PWD="$(pwd -W 2>/dev/null)"; then :; else HOST_PWD="$PWD"; fi
UPLOADS="$HOST_PWD/uploads"

# --- 6. Chạy -----------------------------------------------------------------
step "Khởi động container"
docker rm -f "$NAME" >/dev/null 2>&1
DB_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_CONTAINER}:5432/${DB_NAME}?schema=public"

docker run -d --name "$NAME" \
  --network "$NETWORK" \
  -p "${PORT}:3000" \
  -v "${UPLOADS}:/app/uploads" \
  -e UPLOAD_DIR="/app/uploads" \
  -e DATABASE_URL="$DB_URL" \
  -e DIRECT_URL="$DB_URL" \
  -e NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="$PK" \
  -e CLERK_SECRET_KEY="$SK" \
  "$IMAGE" >/dev/null || die "docker run thất bại"

# --- 7. Chờ nó sống ----------------------------------------------------------
step "Chờ ứng dụng trả lời"
HEALTH=""
for i in $(seq 1 20); do
  HEALTH="$(curl -s --max-time 3 "http://localhost:${PORT}/api/health" 2>/dev/null)"
  case "$HEALTH" in *'"status":"ok"'*) break ;; esac
  printf '  … %s/20\n' "$i"
  sleep 2
done

case "$HEALTH" in
  *'"status":"ok"'*)
    ok "Ứng dụng đã sống: $HEALTH"
    ;;
  *)
    printf '%s✘ Ứng dụng không trả lời. Log của container:%s\n' "$RED" "$OFF" >&2
    docker logs "$NAME" 2>&1 | tail -25 >&2
    printf '\nDừng nó bằng: docker rm -f %s\n' "$NAME" >&2
    exit 1
    ;;
esac

# --- 8. Xong -----------------------------------------------------------------
cat <<INFO

  ${GRN}Mở trình duyệt:  http://localhost:${PORT}${OFF}

  Đăng nhập bằng đúng tài khoản vẫn dùng — đây là database thật, nên
  sửa gì trong lượt này là sửa thật.

  Xem log:   docker logs -f ${NAME}
  Dừng lại:  docker stop ${NAME} && docker rm ${NAME}

INFO
