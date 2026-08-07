import { SignedIn, SignedOut } from "@clerk/nextjs";
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  KanbanSquare,
  Moon,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Logo, Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/constants";

export const metadata: Metadata = {
  title: `${APP_NAME} — ${APP_TAGLINE}`,
  description: APP_DESCRIPTION,
};

const FEATURES = [
  {
    icon: KanbanSquare,
    title: "Bảng Kanban kéo thả",
    body: "Kéo thả mượt mà, giới hạn WIP theo cột, cột tuỳ biến và cập nhật tức thì cho cả nhóm.",
  },
  {
    icon: CheckCircle2,
    title: "Task, Subtask & Checklist",
    body: "Chia nhỏ công việc thành công việc con và checklist, theo dõi tiến độ đến từng bước.",
  },
  {
    icon: BarChart3,
    title: "Dashboard & Analytics",
    body: "Biểu đồ trạng thái, độ ưu tiên, khối lượng theo người và thời gian hoàn thành trung bình.",
  },
  {
    icon: CalendarDays,
    title: "Lịch & Dòng thời gian",
    body: "Nhìn toàn bộ deadline theo tháng, lọc theo dự án hoặc người phụ trách.",
  },
  {
    icon: Bell,
    title: "Thông báo thời gian thực",
    body: "Được giao việc, được nhắc tên trong bình luận hay sắp đến hạn — bạn đều biết ngay.",
  },
  {
    icon: ShieldCheck,
    title: "Phân quyền 4 cấp",
    body: "Chủ sở hữu, quản trị viên, thành viên và người xem, kiểm soát chặt ở cả tầng server.",
  },
];

const STATS = [
  { value: "4", label: "cấp phân quyền" },
  { value: "5", label: "chế độ xem dự án" },
  { value: "100%", label: "TypeScript" },
  { value: "2", label: "chế độ sáng / tối" },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Logo />
            <Wordmark className="text-base" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">
              Tính năng
            </a>
            <a href="#workflow" className="transition-colors hover:text-foreground">
              Cách hoạt động
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SignedOut>
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/sign-in">Đăng nhập</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/sign-up">Dùng thử miễn phí</Link>
              </Button>
            </SignedOut>
            <SignedIn>
              <Button size="sm" asChild>
                <Link href="/onboarding">
                  Vào ứng dụng <ArrowRight className="size-4" />
                </Link>
              </Button>
            </SignedIn>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b">
          <div className="tf-dots absolute inset-0 opacity-60" aria-hidden="true" />
          <div
            className="absolute left-1/2 top-0 -z-0 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-primary/20 blur-[100px]"
            aria-hidden="true"
          />
          <div className="relative mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
            <Badge variant="soft" className="mx-auto mb-5 px-3 py-1">
              <Sparkles className="size-3.5" />
              Kanban · Analytics · Lịch · Phân quyền
            </Badge>
            <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
              Quản lý công việc nhóm{" "}
              <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">
                gọn gàng và rõ ràng
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
              {APP_DESCRIPTION} Được xây dựng trên Next.js 15, Prisma và PostgreSQL — sẵn sàng cho
              đội ngũ thật, dữ liệu thật.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <SignedOut>
                <Button size="lg" asChild>
                  <Link href="/sign-up">
                    Bắt đầu ngay <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/sign-in">Tôi đã có tài khoản</Link>
                </Button>
              </SignedOut>
              <SignedIn>
                <Button size="lg" asChild>
                  <Link href="/onboarding">
                    Mở không gian làm việc <ArrowRight className="size-4" />
                  </Link>
                </Button>
              </SignedIn>
            </div>

            <dl className="mx-auto mt-14 grid max-w-2xl grid-cols-2 gap-6 sm:grid-cols-4">
              {STATS.map((s) => (
                <div key={s.label}>
                  <dt className="text-2xl font-semibold tracking-tight sm:text-3xl">{s.value}</dt>
                  <dd className="mt-1 text-xs text-muted-foreground sm:text-sm">{s.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Đủ dùng cho một nhóm thật sự</h2>
            <p className="mt-3 text-muted-foreground">
              Không phải bản demo. Mọi thao tác đều ghi xuống PostgreSQL, có kiểm tra quyền ở tầng
              server và ghi lại nhật ký hoạt động.
            </p>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="tf-card tf-card-hover p-6">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-4 font-medium">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Workflow */}
        <section id="workflow" className="border-y bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <h2 className="text-3xl font-semibold tracking-tight">
                  Từ ý tưởng đến hoàn thành, trong một luồng
                </h2>
                <ol className="mt-8 space-y-6">
                  {[
                    {
                      icon: Users,
                      title: "Tạo workspace, mời cả nhóm",
                      body: "Một không gian cho mỗi đội. Mời qua email và gán vai trò phù hợp.",
                    },
                    {
                      icon: KanbanSquare,
                      title: "Dựng dự án và bảng Kanban",
                      body: "Mỗi dự án có mã riêng (WEB-42), cột tuỳ biến và giới hạn WIP.",
                    },
                    {
                      icon: BarChart3,
                      title: "Theo dõi bằng số liệu, không phải cảm tính",
                      body: "Dashboard và Analytics cập nhật theo từng thay đổi của nhóm.",
                    },
                  ].map(({ icon: Icon, title, body }, i) => (
                    <li key={title} className="flex gap-4">
                      <div className="flex size-9 shrink-0 items-center justify-center rounded-full border bg-background font-mono text-sm font-medium">
                        {i + 1}
                      </div>
                      <div>
                        <p className="flex items-center gap-2 font-medium">
                          <Icon className="size-4 text-primary" />
                          {title}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">{body}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Static board preview — pure markup, no data required. */}
              <div className="tf-card overflow-hidden p-4 shadow-lg">
                <div className="flex items-center gap-2 border-b pb-3">
                  <span className="size-2.5 rounded-full bg-rose-400" />
                  <span className="size-2.5 rounded-full bg-amber-400" />
                  <span className="size-2.5 rounded-full bg-emerald-400" />
                  <span className="ml-2 font-mono text-xs text-muted-foreground">
                    taskforge.app/w/acme/board
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-4">
                  {[
                    { name: "Cần làm", color: "#64748b", items: ["Thiết kế hero", "Viết tài liệu"] },
                    { name: "Đang làm", color: "#6366f1", items: ["Kéo thả Kanban", "API thông báo"] },
                    { name: "Xong", color: "#10b981", items: ["Khởi tạo dự án"] },
                  ].map((col) => (
                    <div key={col.name} className="space-y-2">
                      <div className="flex items-center gap-1.5 px-1">
                        <span
                          className="size-2 rounded-full"
                          style={{ backgroundColor: col.color }}
                        />
                        <span className="text-xs font-medium">{col.name}</span>
                      </div>
                      {col.items.map((item) => (
                        <div key={item} className="rounded-md border bg-background p-2.5 shadow-sm">
                          <p className="text-xs leading-snug">{item}</p>
                          <div className="mt-2 flex items-center gap-1">
                            <span className="size-4 rounded-full bg-muted" />
                            <span className="h-1.5 w-8 rounded-full bg-muted" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6">
          <Moon className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">
            Sáng, tối, và mọi kích thước màn hình
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Giao diện responsive hoàn chỉnh với Dark Mode thật sự — không phải lớp phủ, mà là bộ
            token màu riêng cho từng chế độ.
          </p>
          <Button size="lg" className="mt-8" asChild>
            <Link href="/sign-up">
              Tạo không gian làm việc <ArrowRight className="size-4" />
            </Link>
          </Button>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <div className="flex items-center gap-2">
            <Logo className="size-6" />
            <span>
              © {new Date().getFullYear()} {APP_NAME}
            </span>
          </div>
          <p>Next.js 15 · TypeScript · Prisma · PostgreSQL · Clerk</p>
        </div>
      </footer>
    </div>
  );
}
