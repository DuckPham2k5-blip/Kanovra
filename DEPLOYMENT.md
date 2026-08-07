# Triển khai TaskForge

Hướng dẫn đưa TaskForge lên production. Có ba con đường; chọn một.

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
CREATE USER taskforge WITH PASSWORD 'mat-khau-that-manh';
CREATE DATABASE taskforge OWNER taskforge;
GRANT ALL PRIVILEGES ON DATABASE taskforge TO taskforge;
SQL
```

Kiểm tra:

```bash
psql "postgresql://taskforge:mat-khau-that-manh@localhost:5432/taskforge" -c '\conninfo'
```

### 1.3. Tạo user chạy ứng dụng

Không chạy ứng dụng bằng `root`:

```bash
adduser --system --group --home /var/www/taskforge deploy
mkdir -p /var/log/taskforge
chown -R deploy:deploy /var/www/taskforge /var/log/taskforge
```

### 1.4. Lấy mã nguồn

```bash
su - deploy -s /bin/bash
git clone https://github.com/<user>/taskforge.git /var/www/taskforge
cd /var/www/taskforge
```

### 1.5. Biến môi trường

```bash
cp .env.example .env
nano .env
```

```env
DATABASE_URL="postgresql://taskforge:mat-khau-that-manh@localhost:5432/taskforge?schema=public"
DIRECT_URL="postgresql://taskforge:mat-khau-that-manh@localhost:5432/taskforge?schema=public"

NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY="pk_live_..."
CLERK_SECRET_KEY="sk_live_..."
CLERK_WEBHOOK_SECRET="whsec_..."

NEXT_PUBLIC_APP_URL="https://taskforge.example.com"
```

Khoá quyền đọc file này:

```bash
chmod 600 .env
```

### 1.6. Deploy lần đầu

```bash
chmod +x deploy/deploy.sh
npm ci
npx prisma migrate deploy
npm run build

mkdir -p .next/standalone/.next
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
cp .env .next/standalone/.env

pm2 start ecosystem.config.js --env production
pm2 save
```

Bật PM2 khởi động cùng hệ thống (chạy bằng `root`):

```bash
exit                                   # trở lại root
pm2 startup systemd -u deploy --hp /var/www/taskforge
# chạy lệnh mà pm2 in ra
```

Kiểm tra:

```bash
curl http://127.0.0.1:3000/api/health
# {"status":"ok","database":"up",...}
```

### 1.7. Nginx + HTTPS

```bash
cp /var/www/taskforge/deploy/nginx.conf /etc/nginx/sites-available/taskforge
nano /etc/nginx/sites-available/taskforge     # đổi server_name thành domain của bạn
ln -sf /etc/nginx/sites-available/taskforge /etc/nginx/sites-enabled/taskforge
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Cấp chứng chỉ Let's Encrypt:

```bash
certbot --nginx -d taskforge.example.com -d www.taskforge.example.com
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
cd /var/www/taskforge
./deploy/deploy.sh
```

Script sẽ: kéo mã mới → cài dependencies → chạy migration → build → reload PM2 không gián đoạn → kiểm tra health, và **tự rollback** về commit trước nếu health check thất bại.

---

## 2. Docker

```bash
cp .env.example .env
nano .env

docker compose --profile app up -d --build
docker compose exec app npx prisma migrate deploy
```

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
| `APP_URL` | `https://taskforge.example.com` |
| `APP_DIR` | `/var/www/taskforge` |

### Tạo cặp khoá SSH cho CI

Trên máy cục bộ:

```bash
ssh-keygen -t ed25519 -C "github-actions-taskforge" -f ~/.ssh/taskforge_deploy -N ""
ssh-copy-id -i ~/.ssh/taskforge_deploy.pub deploy@<ip-vps>
cat ~/.ssh/taskforge_deploy       # dán vào secret SSH_PRIVATE_KEY
```

### Luồng hoạt động

- Push lên `main` hoặc `develop` → workflow **CI** chạy lint, typecheck, build trên PostgreSQL tạm.
- CI xanh trên `main` → workflow **Deploy** SSH vào VPS và chạy `deploy/deploy.sh`.
- Có thể chạy tay từ tab **Actions** → **Deploy to Hostinger** → **Run workflow**.

---

## Vận hành

### Xem log

```bash
pm2 logs taskforge              # log ứng dụng, realtime
pm2 monit                       # CPU / RAM
tail -f /var/log/nginx/taskforge.error.log
```

### Sao lưu database

Tạo `/etc/cron.daily/taskforge-backup`:

```bash
#!/bin/sh
set -e
BACKUP_DIR=/var/backups/taskforge
mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/taskforge-$(date +%F).sql.gz"
sudo -u postgres pg_dump taskforge | gzip > "$FILE"
# Giữ 14 ngày gần nhất
find "$BACKUP_DIR" -name 'taskforge-*.sql.gz' -mtime +14 -delete
```

```bash
chmod +x /etc/cron.daily/taskforge-backup
```

Khôi phục:

```bash
gunzip -c /var/backups/taskforge/taskforge-2026-08-07.sql.gz | sudo -u postgres psql taskforge
```

### Khắc phục sự cố

| Triệu chứng | Nguyên nhân thường gặp |
| --- | --- |
| `502 Bad Gateway` | Tiến trình Node chết — `pm2 logs taskforge` |
| `/api/health` trả 503 | Sai `DATABASE_URL`, hoặc PostgreSQL chưa chạy |
| Đăng nhập chuyển hướng vòng lặp | `NEXT_PUBLIC_APP_URL` không khớp domain thật, hoặc domain chưa thêm vào Clerk |
| Tên/ảnh user không cập nhật | Webhook Clerk sai URL hoặc sai `CLERK_WEBHOOK_SECRET` |
| CSS lệch sau khi deploy | Quên copy `.next/static` vào `.next/standalone/.next/static` |
| `PrismaClientInitializationError` | Chưa chạy `npx prisma generate` sau khi đổi schema |

### Checklist trước khi go-live

- [ ] Dùng **production** keys của Clerk (`pk_live_`, `sk_live_`)
- [ ] `NEXT_PUBLIC_APP_URL` trỏ đúng domain HTTPS
- [ ] Webhook Clerk đã được cấu hình và đã nhận sự kiện thử
- [ ] Chứng chỉ TLS hợp lệ, HTTP tự chuyển sang HTTPS
- [ ] `ufw` đang bật, PostgreSQL không lộ ra Internet
- [ ] Cron sao lưu database đã chạy ít nhất một lần
- [ ] `pm2 save` và `pm2 startup` đã chạy, thử `reboot` một lần
- [ ] `.env` có quyền `600`, không nằm trong Git
