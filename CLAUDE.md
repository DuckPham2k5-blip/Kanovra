# Kanovra

Team task management: workspaces, projects, a drag-and-drop Kanban board,
subtasks, checklists, comments, calendar, analytics, notifications and a
four-level permission model.

Next.js 15 (App Router, Server Components, Server Actions) · TypeScript ·
Tailwind + shadcn/ui · Prisma + PostgreSQL · Clerk auth · Vitest.
Deployed to a Hostinger VPS behind Nginx, run by PM2 in cluster mode.

The interface language is English throughout. The owner communicates in
Vietnamese; answer in Vietnamese unless asked otherwise.

---

## Running it

Postgres lives in Docker; the app runs from a terminal.

```bash
docker start kanovra-db          # or: docker compose up -d postgres
npm run dev                      # http://localhost:3000
```

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

**Never run `npm run build` while `npm run dev` is running.** The production
build overwrites `.next`, which invalidates the dev server's chunk map and
produces `Cannot find module './5745.js'`. Recovering means stopping dev,
deleting `.next`, and starting again.

**Run the dev server in the user's own terminal, not through a tooling
preview.** A preview-managed server is a child of the tool process and dies
with it, which repeatedly looked like an application crash and was not.

---

## Decisions worth knowing before changing things

Each of these was chosen against a specific alternative. Changing one without
the reason will reintroduce a bug that has already been fixed.

**Permissions are checked on the server, every time.** `src/lib/permissions.ts`
holds a role→minimum-rank matrix; every server action calls `can()` before it
writes. Hiding a button is a courtesy, not a control. `permissions.test.ts`
asserts an invariant as well as cases: no lower role may hold a permission a
higher role lacks.

**Every action returns `ActionResult<T>`** — `{ success: true, data }` or
`{ success: false, error, fieldErrors? }`. Clients only ever branch on
`success`. Unexpected throws are caught by `withErrorHandling`, logged with a
reference id, and surfaced as `(ref: abc12345)` so a screenshot maps to one log
line.

**Attachments are stored outside the web root** (`UPLOAD_DIR`, default
`./uploads`) and served through `/api/attachments/[id]`, which re-checks
workspace membership on every download. Anything under `public/` is readable by
whoever has the link, including people outside the workspace. The on-disk name
is always a generated id, never the uploader's filename, which is what makes
path traversal impossible. Only images and PDFs render inline; an uploaded
`.svg` or `.html` downloads instead, because rendering it same-origin would be
stored XSS.

**Live updates use Postgres `LISTEN/NOTIFY`, not an in-memory emitter.** PM2
runs two workers. An in-process EventEmitter reaches only the clients whose SSE
stream sits on the worker that handled the write, so some teammates see an
update and others do not, unpredictably. Postgres is already shared, so it is a
pub/sub bus with no Redis, no third-party service and nothing added to the
client bundle. Published from `logActivity` — the one call every mutation
already makes — rather than from 26 separate sites.

**Notifications say only *that* something changed.** The browser refetches
through the normal data path. A pushed copy of the data can drift from the real
thing, and when it does the bug is invisible until someone reloads.

**Server Actions are rate-limited in middleware, keyed off the `Next-Action`
header.** They are POSTs to the page's own URL, so an Nginx rule on `/api/`
never saw them. Limits are per signed-in user, not per IP: an office behind one
NAT address would otherwise share one allowance. Two workers hold separate
buckets, so the effective ceiling is roughly 2× the configured rate — the
number is set with that already in mind.

**The page accent interpolates a colour, not a hue.** Animating hue as a number
swept 243 → 38 through 200, 168, 120 and 60, so changing pages flashed blue,
teal, green and yellow before settling.

**Decorative layers use `z-0` with content lifted to `z-10`.** At `-z-10` they
landed in the root stacking context and painted *behind* the shell's own opaque
background, which made them invisible at any opacity. This cost three wrong
diagnoses before a minimal repro found it.

**`prefers-reduced-motion` disables movement, not colour.** Cross-fades and the
slow glyph breathe stay on; the ripple, which scales across the screen, does
not. The owner's machine has reduced motion enabled, which silently disabled
three requested effects until this was split.

**The logger redacts by value as well as by key name.** Key-based redaction
missed `DATABASE_URL`, whose name matches no secret pattern while its value
carries a password — and a Prisma connection error quotes that whole string
into its own message, so scrubbing only the context still leaked it via the
stack.

---

## Testing

`npm test` — Vitest, Node environment, `src/**/*.test.ts`.

- `server-only` is aliased to a stub in `vitest.config.mts`. It exists to throw
  when a server module is pulled into a client bundle, which is exactly wrong
  under a test runner that is neither.
- `.env` is loaded via `loadEnv` into `test.env`. Vitest does not read `.env`
  itself, and mutating `process.env` in the config does not reach the workers,
  which run in their own process.
- Skips are explicit (`describe.skipIf`), never an early `return` — Vitest
  reports a returned test as **passed**, so a suite can claim coverage while
  never connecting to anything.
- `realtime.test.ts` needs Postgres running. No configuration is a legitimate
  skip; configured-but-unreachable is a failure.

---

## Traps already hit

- Renaming the Postgres database/user/volume points the app at a fresh empty
  database and orphans the real one. The names stay `taskforge` on purpose.
- `instrumentation.ts` must be at `src/instrumentation.ts` in this project,
  because `src/` exists. At the repo root Next ignores it **silently**.
- `/api/health` must stay in the public route matcher. `auth.protect()` answers
  an unauthenticated API request with 404, which left Docker's healthcheck
  permanently failing.
- Bash heredocs mangle regex escapes and control characters. Write source files
  with the file-writing tool, not by piping through a shell.
- Docker Desktop on this machine can take several minutes to start and may need
  launching from the Start menu by hand.

---

## State and what is left

All application work asked for so far is committed to `main` and green:
typecheck, lint, 40 tests, production build.

**Not verified by anyone yet** — these were built but never seen running,
because the assistant cannot sign in as the user: live updates across two
browser windows, attachment upload/download, the sidebar Log out button, and
the centred background glyph.

**Only the owner can do these:**

- Set `ANTHROPIC_API_KEY` in `.env`, or the AI buttons report "not configured".
- Rename the application in the Clerk dashboard — the sign-in form still says
  "Sign in to TaskForge". Not settable from code.
- Apply `deploy/nginx.conf` on the VPS at deploy time. Without it SSE
  connections are cut every 60s and the write rate limit is not enforced at the
  edge.
- `git push` — never pushed on the owner's behalf without being asked.

**Known feature gaps** versus comparable products, in no particular order: task
dependencies (blocked by / blocks), multi-select and bulk actions, saved and
shareable filter views, recurring tasks, actual time tracking (`estimate`
exists, actuals do not), project templates, keyboard shortcuts beyond ⌘K, undo,
CSV export, public read-only share links.

---

## Working style the owner expects

Verify claims rather than asserting them — render an image and look at it,
run the config through the real tool, write the failing test first. Several
bugs in this project were found only because a check was run instead of
reasoned about, and several wrong diagnoses were shipped when it was not.

Say plainly what was not verified and why.
