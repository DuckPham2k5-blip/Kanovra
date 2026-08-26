# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Multi-stage build producing a minimal image from Next.js `output: standalone`.
# ---------------------------------------------------------------------------

FROM node:20-alpine AS base
# Prisma's engines need libc compatibility on Alpine.
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# --- deps -------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# `npm ci` runs the postinstall `prisma generate`, so the schema must be copied
# before this step.
RUN npm ci

# --- builder ----------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# NEXT_PUBLIC_* values are inlined at build time and must be present here.
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# `public/` là tuỳ chọn trong Next, và dự án này không có thư mục đó — không trên
# đĩa, không trong git. Stage runner bên dưới lại `COPY --from=builder /app/public`
# vô điều kiện, mà BuildKit KHÔNG bỏ qua một COPY --from thiếu nguồn: nó dừng cả
# bản build với `"/app/public": not found` (đã dựng một Dockerfile hai stage nhỏ
# để kiểm đúng hành vi đó). Nghĩa là đường deploy bằng Docker gãy ngay từ lần
# build đầu tiên trên một bản clone sạch.
#
# Tạo thư mục ở đây thay vì thêm public/.gitkeep vào repo: cái cần sửa là một
# COPY đòi thứ không bắt buộc phải có, chứ không phải dự án thiếu thư mục. Lệnh
# này không đổi gì nếu sau này public/ có thật.
RUN mkdir -p /app/public

# --- runner -----------------------------------------------------------------
FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Client Prisma mà ứng dụng cần lúc chạy: bản sinh ra nằm trong .prisma, cùng
# các gói @prisma đi với nó. CLI (`node_modules/prisma`) thì không.
#
# Dòng chú thích cũ ở đây nói là copy để `npx prisma migrate deploy` chạy được
# bên trong container. Nó không chạy được, và đã kiểm bằng cách chạy thật trong
# image vừa build: image không có `node_modules/.bin` nên npx trả
# `sh: prisma: not found`, còn gọi thẳng `node node_modules/prisma/build/index.js`
# thì chết ở `Cannot find module 'effect'` — một phụ thuộc của @prisma/config
# nằm ngoài ba thư mục được copy. Cho CLI chạy được nghĩa là phải copy gần như
# toàn bộ node_modules, và danh sách đó đổi theo từng lần nâng cấp Prisma.
#
# Migration chạy từ stage `builder`, nơi node_modules còn nguyên vẹn — service
# `migrate` trong docker-compose.yml. Đã chạy thật: cả 16 migration áp sạch vào
# một database trống.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
