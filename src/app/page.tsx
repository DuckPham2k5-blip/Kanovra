import { SignedIn, SignedOut } from "@clerk/nextjs";
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  CheckCircle2,
  Gauge,
  KanbanSquare,
  Moon,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { Logo, Wordmark } from "@/components/brand";
import { AmbientBackdrop } from "@/components/layout/ambient-backdrop";
import { PageAccentScope } from "@/components/layout/page-accent-scope";
import {
  ClaudeMark,
  FigmaMark,
  GithubMark,
  GmailMark,
  GoogleDriveMark,
  NotionMark,
  OpenAiMark,
  SlackMark,
  ZapierMark,
} from "@/components/marketing/integration-marks";
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
    title: "Drag-and-drop Kanban",
    body: "Fluid drag and drop, per-column WIP limits, custom columns, instant team-wide updates.",
  },
  {
    icon: CheckCircle2,
    title: "Task, Subtask & Checklist",
    body: "Break work into subtasks and checklists, and track progress step by step.",
  },
  {
    icon: BarChart3,
    title: "Dashboard & Analytics",
    body: "Charts for status, priority, per-person workload and average cycle time.",
  },
  {
    icon: CalendarDays,
    title: "Calendar & Timeline",
    body: "See every deadline by month, filtered by project or assignee.",
  },
  {
    icon: Bell,
    title: "Real-time notifications",
    body: "Assignments, mentions in comments, upcoming deadlines — you hear about all of it.",
  },
  {
    icon: ShieldCheck,
    title: "Four permission levels",
    body: "Owner, admin, member and viewer — enforced on the server, not just in the UI.",
  },
  {
    icon: Sparkles,
    title: "Built-in AI assistant",
    body: "Break a task into subtasks, draft a description, or read the board's status — all reviewed before anything is saved.",
  },
];

const STATS = [
  { value: "4", label: "permission levels" },
  { value: "5", label: "project views" },
  { value: "100%", label: "TypeScript" },
  { value: "2", label: "light / dark" },
];

/**
 * Integrations grid. `status` is honest about what ships today versus what is
 * on the roadmap — a marketing page that overstates it becomes a support
 * burden the first week after launch.
 */
const INTEGRATIONS = [
  {
    mark: GoogleDriveMark,
    name: "Google Drive",
    body: "Attach specs, designs and sheets to a task without leaving the board.",
    status: "Planned",
  },
  {
    mark: GmailMark,
    name: "Gmail",
    body: "Invites and deadline digests land in the inbox your team already lives in.",
    status: "Live",
  },
  {
    mark: ClaudeMark,
    name: "Claude",
    body: "Powers the built-in assistant: task breakdowns, drafts and board summaries.",
    status: "Live",
  },
  {
    mark: SlackMark,
    name: "Slack",
    body: "Push assignments and status changes into the channel that owns the work.",
    status: "Planned",
  },
  {
    mark: GithubMark,
    name: "GitHub",
    body: "Link branches and pull requests to the task key, and close on merge.",
    status: "Planned",
  },
  {
    mark: NotionMark,
    name: "Notion",
    body: "Keep a spec in Notion and mirror its status onto the Kanovra board.",
    status: "Planned",
  },
  {
    mark: FigmaMark,
    name: "Figma",
    body: "Preview the frame a design task refers to, right inside the task panel.",
    status: "Planned",
  },
  {
    mark: OpenAiMark,
    name: "OpenAI",
    body: "Bring your own key if your organisation has standardised on GPT models.",
    status: "Planned",
  },
  {
    mark: ZapierMark,
    name: "Zapier",
    body: "Reach the long tail — 6,000+ apps through a single outbound webhook.",
    status: "Planned",
  },
];

const PRINCIPLES = [
  {
    icon: ShieldCheck,
    title: "The server is the source of truth",
    body: "Every permission is checked again on the server. Hiding a button is a courtesy, never a control — a crafted request gets the same answer as a click.",
  },
  {
    icon: Gauge,
    title: "Fast enough to stay out of the way",
    body: "Server Components render on the server, mutations run as Server Actions, and the board updates optimistically. No loading spinner between a thought and a change.",
  },
  {
    icon: Sparkles,
    title: "AI suggests, people decide",
    body: "The assistant proposes subtasks, drafts and summaries. Nothing it writes reaches the database until someone reviews it and clicks.",
  },
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
              Features
            </a>
            <a href="#workflow" className="transition-colors hover:text-foreground">
              How it works
            </a>
            <a href="#integrations" className="transition-colors hover:text-foreground">
              Integrations
            </a>
            <a href="#about" className="transition-colors hover:text-foreground">
              About
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <SignedOut>
              <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href="/sign-up">Try it free</Link>
              </Button>
            </SignedOut>
            <SignedIn>
              <Button size="sm" asChild>
                <Link href="/onboarding">
                  Open app <ArrowRight className="size-4" />
                </Link>
              </Button>
            </SignedIn>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <PageAccentScope className="relative overflow-hidden border-b">
          <AmbientBackdrop variant="hero" />
          <div className="tf-dots absolute inset-0 opacity-60" aria-hidden="true" />
          <div className="relative mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6 sm:py-28">
            <Badge variant="soft" className="mx-auto mb-5 px-3 py-1">
              <Sparkles className="size-3.5" />
              Kanban · Analytics · Calendar · Roles
            </Badge>
            <h1 className="mx-auto max-w-3xl text-balance text-4xl font-semibold tracking-tight sm:text-6xl">
              Team task management,{" "}
              <span className="bg-gradient-to-r from-indigo-500 to-violet-500 bg-clip-text text-transparent">
                clear and uncluttered
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
              {APP_DESCRIPTION} Built on Next.js 15, Prisma and PostgreSQL — ready for
              real teams and real data.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <SignedOut>
                <Button size="lg" asChild>
                  <Link href="/sign-up">
                    Get started <ArrowRight className="size-4" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild>
                  <Link href="/sign-in">I already have an account</Link>
                </Button>
              </SignedOut>
              <SignedIn>
                <Button size="lg" asChild>
                  <Link href="/onboarding">
                    Open your workspace <ArrowRight className="size-4" />
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
        </PageAccentScope>

        {/* Features */}
        <section id="features" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight">Enough for a real team</h2>
            <p className="mt-3 text-muted-foreground">
              Not a mock-up. Every action writes to PostgreSQL, with permission checks on the
              server and a full activity log.
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
                  From idea to done, in one flow
                </h2>
                <ol className="mt-8 space-y-6">
                  {[
                    {
                      icon: Users,
                      title: "Create a workspace, invite the team",
                      body: "One space per team. Invite by email and assign the right role.",
                    },
                    {
                      icon: KanbanSquare,
                      title: "Set up projects and boards",
                      body: "Each project gets its own key (WEB-42), custom columns and WIP limits.",
                    },
                    {
                      icon: BarChart3,
                      title: "Track with numbers, not gut feel",
                      body: "Dashboard and Analytics update with every change the team makes.",
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
                    kanovra.app/w/acme/board
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 pt-4">
                  {[
                    { name: "To do", color: "#64748b", items: ["Design the hero", "Write the docs"] },
                    { name: "In progress", color: "#6366f1", items: ["Kanban drag & drop", "Notifications API"] },
                    { name: "Done", color: "#10b981", items: ["Project scaffolding"] },
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

        {/* About */}
        <section id="about" className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-12 lg:grid-cols-[1fr_1.15fr]">
            <div>
              <Badge variant="soft" className="mb-4 px-3 py-1">
                About {APP_NAME}
              </Badge>
              <h2 className="text-3xl font-semibold tracking-tight">
                Built by a team that got tired of its own tools
              </h2>
              <div className="mt-5 space-y-4 text-sm leading-relaxed text-muted-foreground">
                <p>
                  {APP_NAME} started as an internal board. We were running a product team
                  across three tools — one for tickets, one for docs, one for the weekly
                  status — and spending more time keeping them in sync than doing the work
                  they described.
                </p>
                <p>
                  So we wrote down what a small team actually needs on a Tuesday afternoon:
                  see what is in flight, move one card, know who is overloaded, and leave.
                  Everything that did not serve that got cut. What is left is a board fast
                  enough to keep open all day and structured enough to answer a planning
                  question without a spreadsheet.
                </p>
                <p>
                  We are a distributed team of six. We use {APP_NAME} to build {APP_NAME},
                  which means every rough edge lands on us first.
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-1">
              {PRINCIPLES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="tf-card p-6">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-4" />
                    </span>
                    <h3 className="font-medium">{title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section id="integrations" className="border-y bg-muted/40">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-semibold tracking-tight">
                Connects to the rest of your stack
              </h2>
              <p className="mt-3 text-muted-foreground">
                A board is only useful if the work around it can reach in. Files, mail,
                chat, code and AI — wired to the task, not bolted to the side.
              </p>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {INTEGRATIONS.map(({ mark: Mark, name, body, status }) => (
                <div key={name} className="tf-card tf-card-hover flex gap-4 p-5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background">
                    <Mark className="size-6" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{name}</h3>
                      <Badge
                        variant={status === "Live" ? "soft" : "outline"}
                        className="px-1.5 py-0 text-[10px]"
                      >
                        {status}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{body}</p>
                  </div>
                </div>
              ))}
            </div>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              Need something that is not listed? Every workspace event is available on an
              outbound webhook, so you can wire the rest yourself.
            </p>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6">
          <Moon className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-4 text-3xl font-semibold tracking-tight">
            Light, dark, and every screen size
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Fully responsive, with a real dark mode — not an overlay, but its own set of
            colour tokens per theme.
          </p>
          <Button size="lg" className="mt-8" asChild>
            <Link href="/sign-up">
              Create workspace <ArrowRight className="size-4" />
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
