# Triển khai Kanovra

Hướng dẫn đưa Kanovra lên production. Có ba con đường; chọn một.

| Cách | Phù hợp khi | Độ khó |
| --- | --- | --- |
| [Hostinger VPS + PM2 + Nginx](#1-hostinger-vps-khuyến-nghị) | Bạn có VPS, muốn kiểm soát hoàn toàn | Trung bình |
| [Docker](#2-docker) | Bạn đã quen container | Dễ |
| [Hostinger Shared Hosting](#3-hostinger-shared-hosting) | Chỉ có gói shared | Có giới hạn |

---

## Chuẩn bị chung

### Database PostgreSQL

Ba lựa chọn, theo thứ tự khuyến nghị:

1. **PostgreSQL trên chính VPS** — nhanh nhất (cùng máy), không tốn thêm chi phí.
2. **Hostinger Managed Database** — Hostinger cung cấp PostgreSQL ở một số gói VPS/Cloud.
3. **Nhà cung cấp ngoài** — [Neon](https://neon.tech), [Supabase](https://supabase.com) đều có bậc miễn phí.

> Nếu dùng connection pooler (Neon/Supabase pgBouncer), đặt `DATABASE_URL` là URL pooled và `DIRECT_URL` là URL trực tiếp. Prisma Migrate cần kết nối trực tiếp.

### Clerk cho production

1. Trong Clerk Dashboard, tạo **Production instance**.
2. Thêm domain của bạn vào **Domains**.
3. Cấu hình DNS theo hướng dẫn Clerk (thường là các bản ghi `CNAME` cho `clerk.`, `accounts.`, `clkmail.`).
4. Lấy **Production API keys** (`pk_live_…`, `sk_live_…`).
5. Tạo webhook trỏ tới `https://<domain>/api/webhooks/clerk`, chọn `user.created`, `user.updated`, `user.deleted`.

---

## 1. Hostinger VPS (khuyến nghị)

### 1.1. Cài môi trường

SSH vào VPS:

```bash
ssh root@<ip-vps>
```

Cài Node.js 20 LTS, PostgreSQL, Nginx và PM2:

```bash
apt update && apt upgrade -y

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs postgresql postgresql-contrib nginx git certbot python3-certbot-nginx

npm install -g pm2
node -v && npm -v
```

### 1.2. Tạo database

```bash
sudo -u postgres psql <<'SQL'
CREATE USER kanovra WITH PASSWORD 'mat-khau-that-manh';
CREATE DATABASE kanovra OWNER kanovra;
GRANT ALL PRIVILEGES ON DATABASE kanovra TO kanovra;
SQL
```

Kiểm tra:

```bash
psql "postgresql://kanovra:mat-khau-that-manh@localhost:5432/kanovra" -c '\conninfo'
```

### 1.3. Tạo user chạy ứng dụng

Không chạy ứng dụng bằng `root`:

```bash
adduser --system --group --home /var/www/kanovra deploy
mkdir -p /var/log/kanovra
chown -R deploy:deploy /var/www/kanovra /var/log/kanovra
```

### 1.4. Lấy mã nguồn

```bash
su - deploy -s /bin/bash
git clone https://github.com/<user>/kanovra.git /var/www/kanovra
cd /var/www/kanovra
```

### 1.5. Biến môi trường

```bash
cp .env.example .env
nano .env
```

```env
DATABASE_URL="postgresql://kanovra:mat-khau-that-manh@localhost:5432/kanovra?schema=public"
DIRECT_URL="postgresql://kanovra:mat-khau-that-manh@localhost:5432/kanovra?schema=public"

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_..."
CLERK_SECRET_KEY="sk_live_..."
CLERK_WEBHOOK_SECRET="whsec_..."

NEXT_PUBLIC_APP_URL="https://kanovra.example.com"
```

Khoá quyền đọc file này:

```bash
chmod 600 .env
```

Rồi soát lại trước khi đi tiếp:

```bash
bash deploy/check-env.sh .env
```

Script chỉ đọc, không bao giờ in giá trị — chỉ in tên biến, độ dài, và những thứ
suy ra được từ tiền tố (khoá Clerk là bản `test` hay bản `live`). Nó bắt đúng
những lỗi mà bảng "khắc phục sự cố" cuối tài liệu này liệt kê, nhưng bắt *trước*
khi deploy thay vì sau: `DIRECT_URL` thiếu hoặc trùng một URL đi qua pooler,
`http://` trên domain thật, hai khoá Clerk khác loại nhau, `CLERK_WEBHOOK_SECRET`
còn là giá trị mẫu, `UPLOAD_DIR` là đường dẫn tương đối. Thoát 1 nếu thiếu thứ
bắt buộc, nên dùng được trong pipeline.

### 1.6. Deploy lần đầu

```bash
chmod +x deploy/deploy.sh
npm ci
npx prisma migrate deploy
npm run build

mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
# `public/` không tồn tại trong repo này, nên `cp` không điều kiện sẽ dừng ở
# `cannot stat 'public'`. Cùng nguyên nhân đã làm hỏng `COPY --from=builder
# /app/public` trong Dockerfile ở lần thứ mười — script `deploy.sh` đã có chốt
# chặn này từ lúc ấy, tài liệu thì chưa.
[ -d public ] && cp -r public .next/standalone/public
cp .env .next/standalone/.env

pm2 start ecosystem.config.js --env production
pm2 save
```

Bật PM2 khởi động cùng hệ thống (chạy bằng `root`):

```bash
exit                                   # trở lại root
pm2 startup systemd -u deploy --hp /var/www/kanovra
# chạy lệnh mà pm2 in ra
```

Kiểm tra:

```bash
curl http://127.0.0.1:3000/api/health
# {"status":"ok","database":"up",...}
```

### 1.7. Nginx + HTTPS

```bash
cp /var/www/kanovra/deploy/nginx.conf /etc/nginx/sites-available/kanovra
nano /etc/nginx/sites-available/kanovra     # đổi server_name thành domain của bạn
ln -sf /etc/nginx/sites-available/kanovra /etc/nginx/sites-enabled/kanovra
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

`nginx -t` lúc này **sẽ báo lỗi** `no "ssl_certificate" is defined for the
"listen ... ssl" directive`, và đúng như vậy: hai dòng chứng chỉ vẫn đang bị chú
thích, certbot ở bước dưới mới điền. Chạy lại `nginx -t` sau khi có chứng chỉ.

Config dùng `listen 443 ssl http2` chứ không dùng `http2 on;`. Chỉ thị `http2 on;`
chỉ có từ nginx 1.25.1, mà Ubuntu 22.04 phát hành nginx 1.18 và 24.04 phát hành
1.24 — trên cả hai, `nginx -t` **hỏng hẳn** với `unknown directive` và config
không bao giờ được nạp. Dạng đang dùng đã chạy thử trên 1.18, 1.24 và 1.31: qua
cả ba, bản mới nhất chỉ cảnh báo deprecated, và HTTP/2 vẫn được thương lượng thật
trên 1.24. Xem phiên bản trên máy mình bằng `nginx -v`.

Cấp chứng chỉ Let's Encrypt:

```bash
certbot --nginx -d kanovra.example.com -d www.kanovra.example.com
systemctl status certbot.timer      # tự động gia hạn
```

### 1.8. DNS

Trong hPanel của Hostinger → **Domains** → **DNS Zone**:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | `@` | `<ip-vps>` | 3600 |
| A | `www` | `<ip-vps>` | 3600 |

Cộng thêm các bản ghi `CNAME` mà Clerk yêu cầu cho domain production.

### 1.9. Tường lửa

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

PostgreSQL chỉ nghe trên `localhost` theo mặc định — đừng mở cổng 5432 ra ngoài.

### 1.10. Các lần deploy sau

```bash
ssh deploy@<ip-vps>
cd /var/www/kanovra
./deploy/deploy.sh
```

Script sẽ: kéo mã mới → cài dependencies → chạy migration → build → reload PM2 không gián đoạn → kiểm tra health, và **tự rollback** về commit trước nếu health check thất bại.

### 1.11. Migration có xoá dữ liệu — đọc trước mỗi lần deploy

`deploy.sh` chạy `prisma migrate deploy`, thứ áp dụng mọi migration còn thiếu theo
đúng thứ tự thư mục, không hỏi gì. Hầu hết chỉ thêm bảng hoặc thêm cột. Nhưng
`20260821143000_remove_flow_map` **xoá dữ liệu**: nó `DELETE` mọi bản ghi
`mind_maps` kiểu `FLOW`, rồi dựng lại enum `MindMapType` không còn `FLOW`.

Câu `DELETE` phải nằm **bên trong** migration đó. Postgres không bỏ được một nhãn
enum tại chỗ, nên Prisma dựng type mới và ép kiểu cột sang — phép ép đó thất bại
chừng nào còn một hàng giữ giá trị cũ. Dọn tay trước thì chạy được ở máy dev và
hỏng trên VPS, nơi không ai dọn cả.

Cái giá của nó, đo bằng một lần diễn tập trên Postgres thật (không phải suy luận):
gieo một map cho mỗi kiểu, hai map `FLOW`, hai comment trên một map `FLOW` và một
comment trên map `TREE`; sau khi áp tám migration còn thiếu, hai map `FLOW` biến
mất, **hai comment của chúng biến mất theo** qua `ON DELETE CASCADE`, còn năm kiểu
kia và comment trên map `TREE` nguyên vẹn. Enum còn đúng năm nhãn.

Nên trước khi deploy, đếm xem mình sắp mất gì:

```bash
sudo -u postgres psql kanovra -c 'SELECT type, count(*) FROM mind_maps GROUP BY type ORDER BY 1;'
sudo -u postgres psql kanovra -c "SELECT count(*) FROM mind_map_comments c JOIN mind_maps m ON m.id = c.\"mapId\" WHERE m.type = 'FLOW';"
```

và sao lưu **ngay trước** khi chạy, chứ không dựa vào bản cron đêm qua:

```bash
sudo -u postgres pg_dump kanovra | gzip > /var/backups/kanovra/pre-deploy-$(date +%F-%H%M).sql.gz
```

Lý do phải sao lưu: phần rollback của `deploy.sh` chỉ đưa **mã nguồn** về commit
cũ. Nó không, và không thể, đảo ngược một migration. Nếu health check hỏng sau
khi migration đã chạy, mã quay về bản cũ còn các hàng `FLOW` thì đã mất hẳn.

Hai đường đi đều đã được diễn tập, và cả hai đều kết thúc ở đúng schema mà mã
nguồn kỳ vọng — `prisma migrate diff --from-schema-datamodel prisma/schema.prisma
--to-url <db> --exit-code` báo `No difference detected`, thoát 0:

| Trạng thái database | Kết quả |
| --- | --- |
| Đang ở tám migration cũ, có sẵn dữ liệu `FLOW` | tám migration còn lại áp sạch |
| Rỗng hoàn toàn (VPS chưa từng deploy) | cả mười sáu migration áp sạch |

Đừng dùng `prisma migrate dev` trên VPS. Khi có cảnh báo mất dữ liệu, nó đòi xác
nhận và sẽ từ chối chạy trong phiên không tương tác — `migrate deploy` thì không.

---

## 2. Docker

```bash
cp .env.example .env
nano .env

docker compose --profile app up -d --build
docker compose --profile migrate run --rm migrate
```

Migration **không** chạy được bằng `docker compose exec app npx prisma migrate
deploy`, dù trước đây tài liệu này ghi như vậy. Image runner cố tình không mang
Prisma CLI: nó không có `node_modules/.bin` nên npx trả `sh: prisma: not found`,
và gọi thẳng CLI thì chết ở `Cannot find module 'effect'`. Service `migrate`
dựng từ stage `builder`, nơi `node_modules` còn nguyên vẹn, và dùng chung layer
với service `app` nên không tốn thêm lần build nào.

Ứng dụng chạy ở `http://localhost:3000`. Vẫn nên đặt Nginx phía trước để lo TLS — dùng cùng file `deploy/nginx.conf`.

Xem log:

```bash
docker compose logs -f app
```

---

## 3. Hostinger Shared Hosting

Gói shared hosting của Hostinger có Node.js nhưng **không có** PostgreSQL và không chạy tiến trình nền lâu dài một cách ổn định. Nếu buộc phải dùng:

1. Dùng database ngoài (Neon hoặc Supabase).
2. Trong hPanel → **Website** → **Node.js**, tạo ứng dụng Node 20, application root trỏ tới thư mục mã nguồn, startup file là `.next/standalone/server.js`.
3. Build **ở máy cục bộ** rồi upload — shared hosting thường không đủ RAM để `next build`.
4. Khai báo biến môi trường trong phần **Environment Variables** của hPanel.

> Khuyến nghị thật lòng: nâng lên VPS. Next.js với Server Actions và Prisma cần một tiến trình Node chạy liên tục, đó là thứ shared hosting không đảm bảo.

---

## GitHub Actions

### Secrets cần khai báo

Repository → **Settings** → **Secrets and variables** → **Actions**:

**Secrets**

| Tên | Giá trị |
| --- | --- |
| `SSH_HOST` | IP hoặc hostname VPS |
| `SSH_USER` | `deploy` |
| `SSH_PRIVATE_KEY` | Nội dung private key (khớp với `~/.ssh/authorized_keys` của user `deploy`) |
| `SSH_PORT` | `22` nếu khác mặc định |

**Variables**

| Tên | Giá trị |
| --- | --- |
| `APP_URL` | `https://kanovra.example.com` |
| `APP_DIR` | `/var/www/kanovra` |

### Tạo cặp khoá SSH cho CI

Trên máy cục bộ:

```bash
ssh-keygen -t ed25519 -C "github-actions-kanovra" -f ~/.ssh/kanovra_deploy -N ""
ssh-copy-id -i ~/.ssh/kanovra_deploy.pub deploy@<ip-vps>
cat ~/.ssh/kanovra_deploy       # dán vào secret SSH_PRIVATE_KEY
```

### Luồng hoạt động

- Push lên `main` hoặc `develop` → workflow **CI** chạy lint, typecheck, build trên PostgreSQL tạm.
- CI xanh trên `main` → workflow **Deploy** SSH vào VPS và chạy `deploy/deploy.sh`.
- Có thể chạy tay từ tab **Actions** → **Deploy to Hostinger** → **Run workflow**.

---

## Vận hành

### Xem log

```bash
pm2 logs kanovra              # log ứng dụng, realtime
pm2 monit                       # CPU / RAM
tail -f /var/log/nginx/kanovra.error.log
```

### Sao lưu database

Tạo `/etc/cron.daily/kanovra-backup`:

```bash
#!/bin/sh
set -e
BACKUP_DIR=/var/backups/kanovra
mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/kanovra-$(date +%F).sql.gz"
sudo -u postgres pg_dump kanovra | gzip > "$FILE"
# Giữ 14 ngày gần nhất
find "$BACKUP_DIR" -name 'kanovra-*.sql.gz' -mtime +14 -delete
```

```bash
chmod +x /etc/cron.daily/kanovra-backup
```

Khôi phục:

```bash
gunzip -c /var/backups/kanovra/kanovra-2026-08-07.sql.gz | sudo -u postgres psql kanovra
```

### Kiểm kê máy chủ

Trước khi đoán bất cứ điều gì về VPS, hỏi nó. Chạy từ **máy của bạn**, không cần
đưa file lên trước:

```bash
ssh root@<ip-vps> 'bash -s' < deploy/inspect.sh > vps-report.txt 2>&1
```

Chỉ đọc: không cài, không sửa, không restart, và `nginx -t` chỉ nạp thử config
chứ không áp dụng. Nó trả về phiên bản nginx, config Kanovra đã cài chưa và dùng
dạng `http2` nào, cổng đang nghe, commit hiện tại của mã nguồn, PM2 của cả user
hiện tại lẫn user `deploy`, `/api/health`, **`_prisma_migrations` đang dừng ở
migration nào**, số map `FLOW` sắp bị migration xoá, chứng chỉ TLS và bản sao
lưu. Phần `.env` chỉ in tên biến và độ dài, không bao giờ in giá trị — bản báo
cáo không chứa bí mật nào.

### Khắc phục sự cố

| Triệu chứng | Nguyên nhân thường gặp |
| --- | --- |
| `502 Bad Gateway` | Tiến trình Node chết — `pm2 logs kanovra` |
| `/api/health` trả 503 | Sai `DATABASE_URL`, hoặc PostgreSQL chưa chạy |
| Đăng nhập chuyển hướng vòng lặp | `NEXT_PUBLIC_APP_URL` không khớp domain thật, hoặc domain chưa thêm vào Clerk |
| Tên/ảnh user không cập nhật | Webhook Clerk sai URL hoặc sai `CLERK_WEBHOOK_SECRET` |
| CSS lệch sau khi deploy | Quên copy `.next/static` vào `.next/standalone/.next/static` |
| `PrismaClientInitializationError` | Chưa chạy `npx prisma generate` sau khi đổi schema |
| `nginx -t`: `unknown directive "http2"` | nginx cũ hơn 1.25.1 gặp `http2 on;`. Config trong repo đã dùng dạng `listen ... ssl http2` chạy được từ 1.18 — kiểm tra xem file trên máy có bị sửa lại không |
| `429` khi thao tác nhanh trên bảng | Đúng thiết kế: Nginx chặn ghi ở mức 10r/s (burst 30) mỗi IP, ứng dụng chặn thêm mỗi người dùng. GET không bị chặn |

### Checklist trước khi go-live

- [ ] `bash deploy/check-env.sh /var/www/kanovra/.env` sạch lỗi
- [ ] Dùng **production** keys của Clerk (`pk_live_`, `sk_live_`)
- [ ] `NEXT_PUBLIC_APP_URL` trỏ đúng domain HTTPS
- [ ] Webhook Clerk đã được cấu hình và đã nhận sự kiện thử
- [ ] Chứng chỉ TLS hợp lệ, HTTP tự chuyển sang HTTPS
- [ ] `nginx -t` sạch **sau khi** certbot đã điền chứng chỉ
- [ ] Đã đếm số map `FLOW` và sao lưu database ngay trước lần deploy có migration
      xoá dữ liệu (mục 1.11)
- [ ] `ufw` đang bật, PostgreSQL không lộ ra Internet
- [ ] Cron sao lưu database đã chạy ít nhất một lần
- [ ] `pm2 save` và `pm2 startup` đã chạy, thử `reboot` một lần
- [ ] `.env` có quyền `600`, không nằm trong Git
