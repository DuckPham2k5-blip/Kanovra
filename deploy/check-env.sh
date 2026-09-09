#!/usr/bin/env bash
#
# Kanovra — soát một file .env trước khi deploy. CHỈ ĐỌC.
#
#   bash deploy/check-env.sh              # soát ./.env
#   bash deploy/check-env.sh /var/www/kanovra/.env
#
# Không bao giờ in giá trị. Chỉ in tên biến, độ dài, và những kết luận rút ra
# được mà không cần lộ giá trị (ví dụ khoá Clerk là bản test hay bản live).
#
# Thoát 1 nếu thiếu thứ bắt buộc, 0 nếu chỉ có cảnh báo. Dùng được trong pipeline.
#
# Mỗi luật dưới đây đã được đối chiếu với mã nguồn, không phải đoán:
#   DIRECT_URL      src/lib/realtime.ts:99   — LISTEN/NOTIFY dùng DIRECT_URL ?? DATABASE_URL
#   CLERK_WEBHOOK…  src/app/api/webhooks/clerk/route.ts:17 — thiếu thì trả 500
#   UPLOAD_DIR      src/lib/storage.ts:21    — mặc định là cwd + /uploads
#   RESEND_API_KEY  src/lib/email.ts:16
#   ANTHROPIC_API…  src/lib/ai.ts:20

ENV_FILE="${1:-.env}"

RED=$'\033[1;31m'; YEL=$'\033[1;33m'; GRN=$'\033[1;32m'; BLU=$'\033[1;34m'; OFF=$'\033[0m'

errors=0
warns=0

fail() { printf '%s✘ %s%s\n' "$RED" "$*" "$OFF"; errors=$((errors + 1)); }
warn() { printf '%s▲ %s%s\n' "$YEL" "$*" "$OFF"; warns=$((warns + 1)); }
ok()   { printf '%s✔ %s%s\n' "$GRN" "$*" "$OFF"; }
note() { printf '  %s\n' "$*"; }
head2() { printf '\n%s===== %s =====%s\n' "$BLU" "$*" "$OFF"; }

if [ ! -f "$ENV_FILE" ]; then
  fail "Không có file: $ENV_FILE"
  exit 1
fi

declare -A ENV

while IFS= read -r line || [ -n "$line" ]; do
  line="${line%$'\r'}"                       # file soạn trên Windows
  case "$line" in ''|'#'*) continue ;; esac
  line="${line#export }"
  case "$line" in *=*) ;; *) continue ;; esac
  k="${line%%=*}"
  v="${line#*=}"
  case "$k" in *[!A-Za-z0-9_]*) continue ;; esac
  # bỏ ngoặc kép hoặc ngoặc đơn bao ngoài
  case "$v" in
    \"*\") v="${v#\"}"; v="${v%\"}" ;;
    \'*\') v="${v#\'}"; v="${v%\'}" ;;
  esac
  ENV["$k"]="$v"
done < "$ENV_FILE"

get() { printf '%s' "${ENV[$1]-}"; }
isset() { [ -n "${ENV[$1]-}" ]; }

# Placeholder trong .env.example: nếu còn nguyên thì coi như chưa điền.
is_placeholder() {
  case "$1" in
    *'<your-'*|*'xxxxxxxx'*|*'mat-khau-that-manh'*|*'example.com'*) return 0 ;;
    *) return 1 ;;
  esac
}

printf '%sSoát: %s%s\n' "$BLU" "$ENV_FILE" "$OFF"
note "$(wc -l < "$ENV_FILE" | tr -d ' ') dòng, ${#ENV[@]} biến đọc được"

# ---------------------------------------------------------------------------
head2 "Bắt buộc — thiếu là ứng dụng không chạy"
# ---------------------------------------------------------------------------
for k in DATABASE_URL NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY CLERK_SECRET_KEY NEXT_PUBLIC_APP_URL; do
  v="$(get "$k")"
  if [ -z "$v" ]; then
    fail "$k chưa đặt"
  elif is_placeholder "$v"; then
    fail "$k vẫn là giá trị mẫu, chưa điền thật"
  else
    ok "$k đã đặt (${#v} ký tự)"
  fi
done

# ---------------------------------------------------------------------------
head2 "Bắt buộc trên production — thiếu thì hỏng âm thầm"
# ---------------------------------------------------------------------------
is_pooled=0
case "$(get DATABASE_URL)" in *pgbouncer*|*-pooler*|*pooler.*) is_pooled=1 ;; esac

if isset DIRECT_URL; then
  if [ "$(get DIRECT_URL)" != "$(get DATABASE_URL)" ]; then
    ok "DIRECT_URL khác DATABASE_URL — đúng khi DATABASE_URL đi qua pooler"
  elif [ "$is_pooled" = "1" ]; then
    fail "DATABASE_URL trông như URL qua pooler mà DIRECT_URL lại y hệt"
    note "Prisma Migrate và LISTEN/NOTIFY đều cần một kết nối trực tiếp."
  else
    ok "DIRECT_URL đặt bằng DATABASE_URL — đúng khi nối thẳng vào Postgres"
  fi
else
  fail "DIRECT_URL chưa đặt"
  note "Cập nhật realtime (LISTEN/NOTIFY) lấy DIRECT_URL rồi mới tới DATABASE_URL"
  note "(src/lib/realtime.ts:99). Thiếu nó thì nó im lặng dùng URL pooled, và"
  note "LISTEN/NOTIFY không chạy qua pgBouncer — cập nhật trực tiếp chết không báo."
  note "Nối thẳng vào Postgres thì đặt bằng đúng DATABASE_URL."
fi

if isset CLERK_WEBHOOK_SECRET && ! is_placeholder "$(get CLERK_WEBHOOK_SECRET)"; then
  ok "CLERK_WEBHOOK_SECRET đã đặt"
else
  warn "CLERK_WEBHOOK_SECRET chưa đặt (hoặc còn là giá trị mẫu)"
  note "Webhook trả 500 và ghi log cảnh báo (route.ts:17). Đăng ký vẫn chạy:"
  note "src/lib/auth.ts tự upsert người dùng ở request đầu tiên, và đã ghi rõ"
  note "là để bù cho đúng trường hợp này. Cái mất là phần CẬP NHẬT — đổi tên"
  note "hay ảnh đại diện bên Clerk sẽ không bao giờ về tới database, và xoá"
  note "tài khoản bên Clerk cũng không."
fi

# ---------------------------------------------------------------------------
head2 "Clerk — bản test hay bản live"
# ---------------------------------------------------------------------------
pk="$(get NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)"
sk="$(get CLERK_SECRET_KEY)"
app_url="$(get NEXT_PUBLIC_APP_URL)"

pk_kind="không rõ"; case "$pk" in pk_test_*) pk_kind="test" ;; pk_live_*) pk_kind="live" ;; esac
sk_kind="không rõ"; case "$sk" in sk_test_*) sk_kind="test" ;; sk_live_*) sk_kind="live" ;; esac
note "publishable: bản $pk_kind    secret: bản $sk_kind"

if [ "$pk_kind" != "$sk_kind" ]; then
  fail "Hai khoá Clerk khác loại nhau ($pk_kind và $sk_kind) — chắc chắn sai một cái"
fi

is_local=0
case "$app_url" in *localhost*|*127.0.0.1*) is_local=1 ;; esac

if [ "$pk_kind" = "test" ] && [ "$is_local" = "0" ]; then
  warn "Khoá Clerk bản test nhưng NEXT_PUBLIC_APP_URL không phải localhost"
  note "Instance development của Clerk không dùng được cho domain thật."
  note "Tạo Production instance rồi lấy cặp pk_live_ / sk_live_."
elif [ "$pk_kind" = "live" ] && [ "$is_local" = "1" ]; then
  warn "Khoá Clerk bản live nhưng ứng dụng lại trỏ về localhost"
fi

# ---------------------------------------------------------------------------
head2 "NEXT_PUBLIC_APP_URL"
# ---------------------------------------------------------------------------
case "$app_url" in
  https://*) ok "https" ;;
  http://localhost*|http://127.0.0.1*) note "http localhost — bình thường khi chạy máy nhà" ;;
  http://*) fail "http:// trên domain thật — Clerk sẽ chuyển hướng vòng lặp" ;;
  *) fail "Không có scheme (thiếu https://)" ;;
esac
case "$app_url" in
  */) warn "Có dấu / ở cuối — bỏ đi cho khớp với chỗ khác ghép đường dẫn vào" ;;
esac

# ---------------------------------------------------------------------------
head2 "UPLOAD_DIR — nơi tệp đính kèm nằm"
# ---------------------------------------------------------------------------
ud="$(get UPLOAD_DIR)"
if [ -z "$ud" ]; then
  warn "UPLOAD_DIR chưa đặt — mặc định là <thư mục làm việc>/uploads (storage.ts:21)"
  note "Nghĩa là nó phụ thuộc cwd của tiến trình. PM2 đặt cwd=/var/www/kanovra"
  note "nên rơi đúng chỗ, nhưng đặt hẳn đường dẫn tuyệt đối thì không phải nhớ."
else
  case "$ud" in
    /*) ok "UPLOAD_DIR là đường dẫn tuyệt đối" ;;
    *)  warn "UPLOAD_DIR là đường dẫn tương đối"
        note "Nó được ghép vào cwd của tiến trình. Đổi cwd là tệp đính kèm cũ"
        note "biến mất khỏi tầm nhìn dù vẫn còn trên đĩa." ;;
  esac
fi

# ---------------------------------------------------------------------------
head2 "Tuỳ chọn — thiếu thì mất tính năng nào"
# ---------------------------------------------------------------------------
opt() {  # $1 tên biến, $2 mất gì
  if isset "$1" && ! is_placeholder "$(get "$1")"; then
    ok "$1 đã đặt"
  else
    note "$(printf '%-22s' "$1") chưa đặt — $2"
  fi
}
opt RESEND_API_KEY    "thư mời không gửi được, phải copy link mời bằng tay"
opt ERROR_WEBHOOK_URL "lỗi chỉ ra stdout (pm2 logs), không đẩy đi đâu"

# Ba nhà cung cấp cho trợ lý; MỘT cái là đủ. Nên chúng được báo cùng nhau chứ
# không phải mỗi cái một dòng "chưa đặt" — ba lời than về cùng một tính năng
# khiến người đọc tưởng thiếu ba thứ.
ai_count=0
for v in ANTHROPIC_API_KEY GOOGLE_AI_API_KEY OPENAI_API_KEY; do
  if isset "$v" && ! is_placeholder "$(get "$v")"; then
    ok "$v đã đặt"
    ai_count=$((ai_count + 1))
  fi
done
if [ "$ai_count" = "0" ]; then
  # Căn lề bằng khoảng trắng đếm tay: printf '%-22s' đếm BYTE, và một nhãn
  # tiếng Việt nhiều byte hơn số ký tự nó hiện ra, nên nó luôn thụt vào.
  note "khoá trợ lý AI         chưa có cái nào — trang Assistant mở được"
  note "                        nhưng không trả lời; các nút AI báo chưa cấu hình."
  note "                        Đặt MỘT trong ANTHROPIC_API_KEY, GOOGLE_AI_API_KEY,"
  note "                        OPENAI_API_KEY là đủ."
elif ! (isset GOOGLE_AI_API_KEY && ! is_placeholder "$(get GOOGLE_AI_API_KEY)")    && ! (isset OPENAI_API_KEY && ! is_placeholder "$(get OPENAI_API_KEY)"); then
  # Claude không tạo được ảnh, nên nút tạo ảnh sẽ không xuất hiện.
  note "tạo ảnh                không có — Claude không sinh ảnh; cần"
  note "                        GOOGLE_AI_API_KEY hoặc OPENAI_API_KEY."
fi

# ---------------------------------------------------------------------------
head2 "Biến lạ"
# ---------------------------------------------------------------------------
known=" DATABASE_URL DIRECT_URL NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY CLERK_SECRET_KEY CLERK_WEBHOOK_SECRET NEXT_PUBLIC_CLERK_SIGN_IN_URL NEXT_PUBLIC_CLERK_SIGN_UP_URL NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL RESEND_API_KEY RESEND_FROM_EMAIL ANTHROPIC_API_KEY GOOGLE_AI_API_KEY OPENAI_API_KEY ERROR_WEBHOOK_URL UPLOAD_DIR NEXT_PUBLIC_APP_URL SEED_DEMO_EMAILS NODE_ENV PORT HOSTNAME PM2_INSTANCES "
unknown=0
for k in "${!ENV[@]}"; do
  case "$known" in *" $k "*) ;; *) note "$k — không có trong .env.example, gõ nhầm tên?"; unknown=$((unknown + 1)) ;; esac
done
[ "$unknown" = "0" ] && note "(không có)"

# ---------------------------------------------------------------------------
printf '\n'
if [ "$errors" -gt 0 ]; then
  printf '%s%d lỗi, %d cảnh báo — chưa deploy được%s\n' "$RED" "$errors" "$warns" "$OFF"
  exit 1
elif [ "$warns" -gt 0 ]; then
  printf '%s0 lỗi, %d cảnh báo — chạy được, đọc kỹ cảnh báo trước khi deploy%s\n' "$YEL" "$warns" "$OFF"
  exit 0
else
  printf '%sKhông có gì phải nói.%s\n' "$GRN" "$OFF"
  exit 0
fi
