#!/usr/bin/env bash
#
# Kanovra — kiểm kê VPS, CHỈ ĐỌC.
#
# Không cài, không sửa, không xoá, không khởi động lại gì cả. Mọi lệnh trong đây
# đều chỉ đọc trạng thái máy. `nginx -t` cũng chỉ nạp thử config chứ không áp
# dụng nó.
#
# Chạy trên VPS:
#   bash deploy/inspect.sh
#
# Hoặc dán thẳng nội dung vào một phiên SSH nếu mã nguồn chưa có trên máy đó.
#
# Về bí mật: phần .env chỉ in TÊN biến và ĐỘ DÀI giá trị, không bao giờ in giá
# trị. Đừng dán nội dung .env thật vào bất cứ đâu.

APP_DIR="${APP_DIR:-/var/www/kanovra}"
APP_USER="${APP_USER:-deploy}"
DB_NAME="${DB_NAME:-kanovra}"

have() { command -v "$1" >/dev/null 2>&1; }

# Root thì không đi vòng qua sudo — script này hay được chạy dạng
# `ssh root@vps 'bash -s' < inspect.sh`, và ở dạng đó stdin đã là chính script,
# nên mọi thứ đòi nhập liệu đều là rắc rối không cần có.
# Chỗ nào cũng dùng `$SUDO` không ngoặc kép: khi rỗng nó biến mất hẳn khỏi dòng
# lệnh chứ không thành một tham số rỗng.
if [ "$(id -u)" = "0" ]; then SUDO=""; elif have sudo; then SUDO="sudo"; else SUDO=""; fi

# Ngoại lệ duy nhất là `sudo -u postgres`: bỏ `sudo` đi thì `-u` trở thành tên
# lệnh. Nên phần Postgres đi qua hàm này thay vì qua $SUDO. SQL đi vào `su` bằng
# biến môi trường chứ không nhét vào chuỗi lệnh — trong đó có dấu ngoặc kép
# (`"mapId"`) mà lồng vào chuỗi thì hỏng.
pgq() {  # $1 = database ("" nếu không cần), $2 = SQL, $3 = cờ thêm cho psql
  if [ "$(id -u)" = "0" ]; then
    KDB="$1" KSQL="$2" KFLAG="${3:-}" su postgres -s /bin/sh -c \
      'if [ -n "$KDB" ]; then psql $KFLAG -d "$KDB" -c "$KSQL"; else psql $KFLAG -c "$KSQL"; fi'
  elif have sudo; then
    if [ -n "$1" ]; then sudo -u postgres psql ${3:-} -d "$1" -c "$2"
    else sudo -u postgres psql ${3:-} -c "$2"; fi
  else
    echo "(không chạy được với quyền postgres: máy không có sudo và không phải root)"
  fi
}

section() { printf '\n\033[1;34m===== %s =====\033[0m\n' "$*"; }
item()    { printf '  %s\n' "$*"; }
missing() { printf '  (không có: %s)\n' "$*"; }

# ---------------------------------------------------------------------------
section "1. Máy"
# ---------------------------------------------------------------------------
item "$(uname -a)"
if [ -r /etc/os-release ]; then
  item "$(. /etc/os-release; echo "$PRETTY_NAME")"
fi
item "uptime: $(uptime -p 2>/dev/null || uptime)"
echo
free -h 2>/dev/null | sed 's/^/  /'
echo
df -h / 2>/dev/null | sed 's/^/  /'

# ---------------------------------------------------------------------------
section "2. Công cụ đã cài"
# ---------------------------------------------------------------------------
for c in git node npm pm2 nginx psql certbot ufw curl; do
  if have "$c"; then
    case "$c" in
      nginx) item "$(printf '%-8s' "$c") $($SUDO nginx -v 2>&1)" ;;
      psql)  item "$(printf '%-8s' "$c") $(psql --version 2>&1)" ;;
      pm2)   item "$(printf '%-8s' "$c") $(pm2 --version 2>&1 | tail -1)" ;;
      *)     item "$(printf '%-8s' "$c") $($c --version 2>&1 | head -1)" ;;
    esac
  else
    missing "$c"
  fi
done

# ---------------------------------------------------------------------------
section "3. Nginx"
# ---------------------------------------------------------------------------
if have nginx; then
  item "sites-enabled:"
  ls -l /etc/nginx/sites-enabled/ 2>/dev/null | sed 's/^/    /' || missing "/etc/nginx/sites-enabled"

  for f in /etc/nginx/sites-available/kanovra /etc/nginx/conf.d/kanovra.conf; do
    if [ -f "$f" ]; then
      item "config Kanovra: $f"
      item "  dòng có http2 (phải là 'listen ... ssl http2', KHÔNG phải 'http2 on;'):"
      grep -n 'http2' "$f" 2>/dev/null | sed 's/^/      /' || item "      (không có dòng http2 nào)"
      item "  dòng ssl_certificate (bị chú thích = certbot chưa chạy):"
      grep -n 'ssl_certificate' "$f" 2>/dev/null | sed 's/^/      /' || item "      (không có)"
      item "  server_name:"
      grep -n 'server_name' "$f" 2>/dev/null | sed 's/^/      /'
      item "  có limit_req_status không (429 thay vì 503):"
      grep -n 'limit_req_status' "$f" 2>/dev/null | sed 's/^/      /' || item "      (không có — là bản cũ)"
    fi
  done

  item "nginx -t:"
  NGINX_T="$($SUDO nginx -t 2>&1)"
  printf '%s\n' "$NGINX_T" | sed 's/^/    /'
  case "$NGINX_T" in
    *'no "ssl_certificate" is defined'*)
      item "    ^ bình thường nếu certbot chưa chạy: hai dòng chứng chỉ vẫn đang bị"
      item "      chú thích. Chạy lại lệnh này sau khi cấp chứng chỉ." ;;
    *'unknown directive "http2"'*)
      item "    ^ nginx trên máy này cũ hơn 1.25.1 mà config lại dùng 'http2 on;'."
      item "      Bản trong repo đã đổi sang 'listen ... ssl http2' — file trên máy là bản cũ." ;;
  esac
else
  missing "nginx"
fi

# ---------------------------------------------------------------------------
section "4. Cổng đang nghe"
# ---------------------------------------------------------------------------
if have ss; then
  $SUDO ss -tlnp 2>/dev/null | sed 's/^/  /'
elif have netstat; then
  $SUDO netstat -tlnp 2>/dev/null | sed 's/^/  /'
else
  missing "ss và netstat"
fi

# ---------------------------------------------------------------------------
section "5. Mã nguồn ứng dụng"
# ---------------------------------------------------------------------------
if [ -d "$APP_DIR" ]; then
  item "thư mục: $APP_DIR"
  ls -la "$APP_DIR" 2>/dev/null | head -25 | sed 's/^/    /'
  if [ -d "$APP_DIR/.git" ]; then
    echo
    item "commit hiện tại:"
    git -C "$APP_DIR" log --oneline -3 2>&1 | sed 's/^/    /'
    item "branch: $(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD 2>&1)"
    item "remote:"
    git -C "$APP_DIR" remote -v 2>&1 | sed 's/^/    /'
    item "thay đổi chưa commit:"
    git -C "$APP_DIR" status --short 2>&1 | head -20 | sed 's/^/    /'
  else
    missing "$APP_DIR/.git — mã nguồn không phải một repo git"
  fi
  echo
  item "bản build:"
  [ -f "$APP_DIR/.next/standalone/server.js" ] \
    && item "    .next/standalone/server.js có ($(date -r "$APP_DIR/.next/standalone/server.js" 2>/dev/null))" \
    || item "    .next/standalone/server.js KHÔNG có — chưa từng build ở đây"
  [ -d "$APP_DIR/.next/standalone/.next/static" ] \
    && item "    .next/standalone/.next/static có" \
    || item "    .next/standalone/.next/static KHÔNG có — CSS sẽ lệch"
  [ -d "$APP_DIR/uploads" ] \
    && item "    uploads/: $(find "$APP_DIR/uploads" -type f 2>/dev/null | wc -l) file, $(du -sh "$APP_DIR/uploads" 2>/dev/null | cut -f1)" \
    || item "    uploads/ chưa có"
else
  missing "$APP_DIR"
fi

# ---------------------------------------------------------------------------
section "6. .env — chỉ tên biến và độ dài, không bao giờ in giá trị"
# ---------------------------------------------------------------------------
if [ -f "$APP_DIR/.env" ]; then
  item "quyền: $(stat -c '%a %U:%G' "$APP_DIR/.env" 2>/dev/null) (nên là 600)"
  awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{
      k=$1;
      v=substr($0, index($0,"=")+1);
      gsub(/^"|"$/,"",v);
      printf "  %-42s %s\n", k, (length(v)==0 ? "(trống)" : "(đã đặt, " length(v) " ký tự)")
    }' "$APP_DIR/.env"
else
  missing "$APP_DIR/.env"
fi

# ---------------------------------------------------------------------------
section "7. PM2"
# ---------------------------------------------------------------------------
if have pm2; then
  item "của user hiện tại ($(id -un)):"
  pm2 list 2>&1 | sed 's/^/    /'
fi
if id "$APP_USER" >/dev/null 2>&1; then
  item "của user $APP_USER:"
  $SUDO su - "$APP_USER" -s /bin/bash -c 'pm2 list' 2>&1 | sed 's/^/    /'
else
  missing "user $APP_USER"
fi
item "dịch vụ systemd của pm2:"
# Không viết `... | grep | sed || item`: mã thoát của một pipeline là mã thoát
# của lệnh CUỐI, nên sed thành công với đầu vào rỗng và nhánh `||` không bao giờ
# chạy — mục này im lặng thay vì nói là không có.
PM2_UNITS="$(systemctl list-units --type=service --no-pager 2>/dev/null | grep -i pm2)"
if [ -n "$PM2_UNITS" ]; then printf '%s\n' "$PM2_UNITS" | sed 's/^/    /'; else item "    (không có)"; fi

# ---------------------------------------------------------------------------
section "8. Ứng dụng có trả lời không"
# ---------------------------------------------------------------------------
if have curl; then
  item "http://127.0.0.1:3000/api/health:"
  curl -s --max-time 5 http://127.0.0.1:3000/api/health 2>&1 | head -5 | sed 's/^/    /'
  echo
  item "mã trạng thái: $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:3000/api/health 2>&1)"
else
  missing "curl"
fi

# ---------------------------------------------------------------------------
section "9. PostgreSQL"
# ---------------------------------------------------------------------------
if have psql; then
  item "danh sách database:"
  pgq "" "SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY 1;" "-tA" 2>&1 | sed 's/^/    /'
  echo
  item "migration đã áp trên '$DB_NAME' (đây là con số quan trọng nhất):"
  pgq "$DB_NAME" "SELECT migration_name, finished_at, rolled_back_at FROM _prisma_migrations ORDER BY started_at;" 2>&1 | sed 's/^/    /'
  echo
  item "map theo kiểu — bao nhiêu hàng FLOW sắp bị migration xoá:"
  pgq "$DB_NAME" "SELECT type, count(*) FROM mind_maps GROUP BY type ORDER BY 1;" 2>&1 | sed 's/^/    /'
  echo
  item "comment sẽ mất theo các map FLOW đó:"
  pgq "$DB_NAME" "SELECT count(*) FROM mind_map_comments c JOIN mind_maps m ON m.id = c.\"mapId\" WHERE m.type = 'FLOW';" "-tA" 2>&1 | sed 's/^/    /'
  echo
  item "kích thước dữ liệu thật:"
  pgq "$DB_NAME" "SELECT 'users' t, count(*) FROM users UNION ALL SELECT 'workspaces', count(*) FROM workspaces UNION ALL SELECT 'projects', count(*) FROM projects UNION ALL SELECT 'tasks', count(*) FROM tasks UNION ALL SELECT 'mind_maps', count(*) FROM mind_maps ORDER BY 1;" 2>&1 | sed 's/^/    /'
else
  missing "psql — database có thể nằm ở máy khác, xem DATABASE_URL ở mục 6"
fi

# ---------------------------------------------------------------------------
section "10. TLS và tường lửa"
# ---------------------------------------------------------------------------
if have certbot; then
  $SUDO certbot certificates 2>&1 | sed 's/^/  /'
else
  missing "certbot"
fi
echo
if have ufw; then
  $SUDO ufw status 2>&1 | sed 's/^/  /'
else
  missing "ufw"
fi

# ---------------------------------------------------------------------------
section "11. Sao lưu"
# ---------------------------------------------------------------------------
if [ -d /var/backups/kanovra ]; then
  ls -lh /var/backups/kanovra/ 2>/dev/null | tail -10 | sed 's/^/  /'
else
  missing "/var/backups/kanovra — chưa có bản sao lưu nào"
fi
[ -f /etc/cron.daily/kanovra-backup ] \
  && item "cron sao lưu hằng ngày: có" \
  || item "cron sao lưu hằng ngày: KHÔNG có"

printf '\n\033[1;32m===== hết — không có gì bị thay đổi =====\033[0m\n'
