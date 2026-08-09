# Kanovra

Nền tảng quản lý công việc nhóm: bảng Kanban kéo thả, dashboard, analytics và lịch — tất cả trong một.

Xây dựng bằng **Next.js 15 (App Router)**, **TypeScript**, **TailwindCSS + shadcn/ui**, **Prisma + PostgreSQL** và **Clerk Authentication**.

---

## Tính năng

| Nhóm | Chi tiết |
| --- | --- |
| **Workspace** | Nhiều workspace, chuyển đổi nhanh, nhãn dùng chung, chuyển quyền sở hữu |
| **Project** | Mã dự án (`WEB-42`), màu & biểu tượng, trạng thái vòng đời, lưu trữ |
| **Kanban** | Kéo thả bằng chuột **và bàn phím**, cột tuỳ biến, giới hạn WIP, trạng thái tự đồng bộ theo cột |
| **Task** | Subtask, checklist, nhãn, độ ưu tiên, người phụ trách, ngày bắt đầu/hạn chót, ước lượng, bình luận có `@mention`, đính kèm |
| **Dashboard** | Chỉ số tổng quan, tiến độ từng dự án, hoạt động gần đây |
| **Analytics** | Throughput theo ngày, phân bổ trạng thái/độ ưu tiên, khối lượng theo người, thời gian hoàn thành trung bình |
| **Calendar** | Lưới tháng theo hạn chót, lọc theo dự án và người phụ trách |
| **Notification** | Được giao việc, bình luận, được nhắc tên, sắp đến hạn, hoàn thành |
| **Phân quyền** | 4 vai trò — Owner / Admin / Member / Viewer, kiểm soát tập trung tại `src/lib/permissions.ts` |
| **UX** | Dark Mode, responsive từ điện thoại tới desktop, command palette `⌘K`, toast, skeleton loading |

---

## Kiến trúc

```
src/
├─ app/
│  ├─ (auth)/                 Trang đăng nhập & đăng ký (Clerk)
│  ├─ (app)/w/[slug]/         Toàn bộ ứng dụng, scope theo workspace
│  ├─ api/
│  │  ├─ health/              Probe cho Docker / PM2 / CI
│  │  ├─ notifications/       Polling cho chuông thông báo
│  │  ├─ search/              Backend cho command palette
│  │  └─ webhooks/clerk/      Đồng bộ user từ Clerk
│  ├─ invite/[token]/         Nhận lời mời vào workspace
│  └─ onboarding/             Tạo hoặc chọn workspace đầu tiên
├─ components/
│  ├─ ui/                     shadcn/ui primitives (không chứa logic nghiệp vụ)
│  ├─ layout/                 App shell: sidebar, topbar, command palette
│  └─ <domain>/               Component theo miền: project, task, board, …
├─ lib/
│  ├─ auth.ts                 Guard xác thực + phân giải workspace/project/task
│  ├─ permissions.ts          Ma trận RBAC — nguồn sự thật duy nhất về quyền
│  ├─ queries.ts              Toàn bộ truy vấn đọc (server-only)
│  ├─ events.ts               Ghi activity log + gửi notification
│  ├─ validations.ts          Schema Zod dùng chung client/server
│  └─ constants.ts            Metadata hiển thị cho các enum
├─ server/
│  ├─ action-result.ts        Kiểu trả về thống nhất `{ success, data | error }`
│  └─ actions/                Server Actions — toàn bộ thao tác ghi
└─ middleware.ts              Clerk middleware, mặc định chặn mọi route
```

**Nguyên tắc phân lớp**

1. **Đọc** đi qua `src/lib/queries.ts`, gọi từ Server Component. Không có REST endpoint thừa.
2. **Ghi** đi qua Server Actions trong `src/server/actions/`. Mỗi action: `requireUser()` → validate Zod → kiểm tra quyền → ghi DB → `logActivity`/`notify` → `revalidatePath`.
3. **Quyền** chỉ định nghĩa một chỗ (`permissions.ts`) và được kiểm tra ở **server**; UI chỉ ẩn/hiện cho gọn, không phải hàng rào bảo mật.
4. **Thứ tự** thẻ và cột dùng *fractional index* (`order: Float`) nên kéo thả thường chỉ cần cập nhật một dòng.

---

## Bắt đầu

### Yêu cầu

- **Node.js 20.11+** (xem `.nvmrc`)
- **PostgreSQL 14+** — hoặc dùng Docker bên dưới
- Tài khoản **Clerk** miễn phí: <https://dashboard.clerk.com>

### 1. Cài đặt

```bash
git clone https://github.com/<user>/kanovra.git
cd kanovra
npm install
```

### 2. Cấu hình biến môi trường

```bash
cp .env.example .env
```

Điền vào `.env`:

| Biến | Lấy ở đâu |
| --- | --- |
| `DATABASE_URL` | Chuỗi kết nối PostgreSQL |
| `DIRECT_URL` | Giống `DATABASE_URL`, trừ khi dùng connection pooler (Neon/Supabase) |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk → API Keys |
| `CLERK_SECRET_KEY` | Clerk → API Keys |
| `CLERK_WEBHOOK_SECRET` | Clerk → Webhooks → endpoint của bạn |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` khi phát triển |

### 3. Khởi động database

```bash
docker compose up -d
```

Hoặc trỏ `DATABASE_URL` tới một PostgreSQL sẵn có.

### 4. Tạo schema và dữ liệu mẫu

Migration khởi tạo đã có sẵn trong `prisma/migrations/`, chỉ cần áp dụng:

```bash
npm run db:migrate      # áp dụng migration
npm run db:seed         # workspace demo với 3 dự án và ~40 công việc
```

### 5. Chạy

```bash
npm run dev
```

Mở <http://localhost:3000>.

> **Lưu ý về seed:** script gắn dữ liệu demo vào user đầu tiên trong bảng `users`. Nếu bạn đăng nhập **trước** khi seed, workspace demo sẽ thuộc về chính bạn. Nếu seed trước, hãy chạy lại `npm run db:seed` sau lần đăng nhập đầu tiên.

### 6. Cấu hình Clerk webhook

Trong Clerk Dashboard → **Webhooks** → **Add Endpoint**:

- URL: `https://<domain>/api/webhooks/clerk`
- Events: `user.created`, `user.updated`, `user.deleted`
- Copy **Signing Secret** vào `CLERK_WEBHOOK_SECRET`

Khi phát triển cục bộ, dùng `ngrok http 3000` rồi trỏ endpoint vào URL ngrok. Ứng dụng vẫn hoạt động không cần webhook — `getCurrentUser()` tự tạo bản ghi user khi cần — nhưng webhook giữ tên và ảnh đại diện luôn đồng bộ.

---

## Lệnh có sẵn

| Lệnh | Mô tả |
| --- | --- |
| `npm run dev` | Chạy dev server |
| `npm run build` | Generate Prisma client rồi build production |
| `npm start` | Chạy bản build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, không phát sinh file |
| `npm run format` | Prettier |
| `npm run db:migrate` | Tạo & áp dụng migration (dev) |
| `npm run db:deploy` | Áp dụng migration (production) |
| `npm run db:push` | Đẩy schema không tạo migration (prototyping) |
| `npm run db:studio` | Prisma Studio |
| `npm run db:seed` | Nạp dữ liệu demo |

---

## Phân quyền

| Hành động | Owner | Admin | Member | Viewer |
| --- | :-: | :-: | :-: | :-: |
| Xem workspace, dự án, công việc | ✅ | ✅ | ✅ | ✅ |
| Tạo / sửa công việc, bình luận, checklist | ✅ | ✅ | ✅ | — |
| Tạo & sửa dự án, quản lý cột | ✅ | ✅ | ✅ | — |
| Lưu trữ / xoá dự án | ✅ | ✅ | — | — |
| Mời & phân vai trò thành viên | ✅ | ✅ | — | — |
| Xoá bình luận của người khác | ✅ | ✅ | — | — |
| Sửa cấu hình workspace | ✅ | ✅ | — | — |
| Chuyển quyền sở hữu, xoá workspace | ✅ | — | — | — |

Ma trận này được sinh từ `MINIMUM_ROLE` trong [`src/lib/permissions.ts`](src/lib/permissions.ts).

---

## Triển khai

Xem [DEPLOYMENT.md](DEPLOYMENT.md) để biết hướng dẫn chi tiết cho **Hostinger VPS** (PM2 + Nginx + Let's Encrypt), Docker, và cấu hình GitHub Actions.

Tóm tắt nhanh cho VPS:

```bash
ssh user@your-vps
git clone https://github.com/<user>/kanovra.git /var/www/kanovra
cd /var/www/kanovra
cp .env.example .env && nano .env
chmod +x deploy/deploy.sh
./deploy/deploy.sh
```

---

## Đưa lên GitHub

Repo chưa được khởi tạo Git. Khi bạn sẵn sàng:

```bash
git init -b main
git add .
git commit -m "feat: initial Kanovra implementation"
git remote add origin https://github.com/<user>/kanovra.git
git push -u origin main
```

`.gitignore` đã loại trừ `node_modules`, `.next` và mọi file `.env`. Thư mục
`prisma/migrations/` **được commit** — production dựa vào nó để chạy
`prisma migrate deploy`.

Sau đó khai báo secrets cho GitHub Actions theo [DEPLOYMENT.md](DEPLOYMENT.md#github-actions).

---

## Đóng góp

1. Tạo nhánh từ `develop`: `git checkout -b feat/ten-tinh-nang`
2. Đảm bảo `npm run lint && npm run typecheck && npm run build` đều sạch
3. Mở Pull Request theo mẫu trong `.github/pull_request_template.md`

---

## Giấy phép

MIT
