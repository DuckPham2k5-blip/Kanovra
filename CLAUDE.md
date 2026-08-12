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
- **Two tabs of the same browser still cannot demonstrate live updates**, though
  two different browsers now can. The client skips its own echo, and "its own"
  is the browser, keyed on the `tf_origin` cookie (`realtime-sync.tsx`). Cookies
  are per browser, not per tab, so a second tab still discards what the first
  one did. A laptop and a phone, or Edge and Chrome, do update each other.
  This used to be keyed on `actorId`, which made one person's two devices
  invisible to each other — see the note in `ChangeEvent`.
- **`publishChange` logs nothing on success**, so a silent server log is not
  evidence either way. To watch the bus, open a separate `LISTEN
  kanovra_changes` connection and read the payloads directly; to check the app
  is subscribed, look for `query ilike 'listen%'` in `pg_stat_activity`. That
  subscription is lazy — nothing listens until an SSE stream opens.
- **`npm run dev` must be stopped before `prisma generate` or `npm run build`.**
  The dev server holds `query_engine-windows.dll.node`, so generate fails with
  `EPERM`; and a build overwrites `.next` under the running server, which is
  the `Cannot find module` trap above. Check by looking for a **listener on
  port 3000**, not by asking `/api/health` — a busy dev server fails that probe
  while very much running, which is how the build got launched anyway once.
- **Radix numbers its menus with `useId`.** On a page with several triggers the
  count can differ between the server render and hydration, and every trigger
  after the first mismatch warns. An explicit `id` on the trigger does *not*
  fix it — Radix overwrites it. Mounting the menu after hydration does.
- **A card in the same colour family as the page wash cannot be rescued by
  darkening it.** The Maps section was lime over a lime map card; two rounds of
  making the card more opaque changed nothing. Section hues are picked by
  measuring distance from the colours that share the page.
- When testing anything by changing the database underneath a running page,
  change the data *first* without notifying and confirm the screen has **not**
  moved. Otherwise a stray reload — or Fast Refresh after a recompile — gets
  mistaken for the feature working.

---

## State and what is left

All application work asked for so far is committed to `main` and green:
typecheck, lint, 40 tests, production build.

**Live updates: verified end to end on 2026-08-10**, in dev, with the owner
driving the browser. What the run actually established:

- A drag published a notification. Two `TASK_MOVED` activities produced two
  `pg_notify` calls whose timestamps matched the activity rows to the second.
- The notification left the app process. A separate Node process holding its
  own `LISTEN kanovra_changes` connection received both — which is precisely
  what an in-process `EventEmitter` cannot do, and the reason this design was
  chosen.
- The delivery half works. Publishing a change with a *different* `actorId`
  while a task title had been altered directly in the database made the board
  redraw with the new title, no reload, roughly half a second later.
- `EventSource` reconnects after a stream ends. One SSE request closed at
  395s; delivery still worked on that page half an hour after it loaded.

The authorization half was closed the same day, without a second account. A
workspace the owner is *not* a member of, holding a project, a task and an
attachment, exercises exactly the branch that was unproven — the check asks
whether the caller is a member, and does not care which account calls. From
the owner's own signed-in session, `/api/realtime/outsider-test` answered
`Not found` while `/api/realtime/acme-product` opened a real stream in the
next tab, and `/api/attachments/<id in that workspace>` answered `Not found`
while an attachment in the owner's own workspace rendered inline. One route,
one session, opposite answers — which is what rules out "the route is simply
broken". The fixture was deleted afterwards. That run also showed the 25s
`: keep-alive` heartbeat arriving, which nothing had confirmed before.

Still unverified: **two genuinely different signed-in sessions** exchanging
updates (the teammate has only ever been simulated — either at the bus or by
a fixture, never by a second Clerk account); **the multi-worker case** that
motivates the whole design — dev is a single process, so cross-*worker*
delivery has not been seen; and the Nginx config.

**Attachments, Log out and the page glyph: verified the same day**, with the
owner signed in and the assistant driving a browser against that session.

- Two files uploaded through the UI landed in `uploads/` under generated
  UUIDs, never the uploader's filename, and nothing appeared under `public/`.
- The stored-XSS guard holds. An `.svg` carrying a `<script>` came back as
  `application/octet-stream` with `Content-Disposition: attachment`, so the
  browser cannot execute it on our origin; a `.png` came back `image/png`
  inline. Bogus ids and both spellings of a path-traversal id answered 404.
- Remove deletes the row **and** the file on disk — the silent failure here
  is a UI that forgets the bytes, and it does not happen.
- Log out calls `Clerk.signOut`, clears the session and its cookie, returns
  to `/`, and a protected URL then bounces to `/sign-in`.
- The glyph is genuinely painted, not just present in the DOM: photographed
  on Notifications, and above the shell background at 361 of 361 sampled
  points, so the `-z-10` bug has not come back. Under the reduced-motion
  preference it still draws, lines complete, breathe stretched to 9s. How
  much of it shows is a function of page density — 94% on Notifications, 25%
  on a full board — which is the design working, not a fault.

The membership re-check in `/api/attachments/[id]` was proven the same way as
the realtime one, with a workspace the owner does not belong to — see above.

**Only the owner can do these:**

- Set `ANTHROPIC_API_KEY` in `.env`, or the AI buttons report "not configured".
- Rename the application in the Clerk dashboard — the sign-in form still says
  "Sign in to TaskForge". Not settable from code.
- Apply `deploy/nginx.conf` on the VPS at deploy time. Without it SSE
  connections are cut every 60s and the write rate limit is not enforced at the
  edge.
- `git push` — never pushed on the owner's behalf without being asked.

## Built after the first pass (2026-08-11 → 12)

**Presence.** A lit ring on an avatar means that person has the app open. It
is a decaying `lastSeenAt` timestamp, not an online flag: a browser that
crashes never says "I left", so a flag sticks forever. One endpoint both
records the caller's heartbeat and returns who else is here. Whoever is online
sorts to the front of an avatar stack, and the `+N` chip lights when somebody
online is folded inside it.

**Cross-device sync.** The realtime client used to drop events whose `actorId`
matched the viewer, which meant one person's laptop and phone ignored each
other. It is keyed on a `tf_origin` cookie now — the browser, not the person.
Two tabs of one browser still share a cookie and so still ignore each other.

**Sound.** Two cues synthesised with WebAudio, no asset files: a pop when
somebody arrives, silence when they leave, and a ping for notifications, with
a mute toggle in the bell. The gesture listener that wakes the AudioContext is
deliberately never removed — removing it after the first click let the browser
suspend the context again, and the next cue paid 585ms of latency asking
permission at the moment it was due. Measured before and after: 585ms → 1ms.

**Project backdrops.** A gradient, an uploaded picture or a linked one, only
ever one at a time. Links are fetched once on save and rejected unless the
response is a real image — a Pinterest share link is a valid URL to an HTML
page, and accepting it produced an empty header nobody could explain. Every
hop of that fetch is resolved and refused if the IP is private, because
fetching an address a visitor chose is how a server gets asked what it can
reach that they cannot.

**Mind maps.** A new section with the eight Thinking Maps. Circle, bubble and
double bubble are free canvases; the other five are laid out from their
structure and cannot be dragged. The canvas is an unbounded plane — pan and
zoom are one transform, not a scrollable box, which is what a fixed sheet
could not do. Node size is chosen when a node is made, in either direction
without limit, rather than derived from depth.

**Still unfinished on the maps**, from the owner's sketches: per-node presence
avatars, a `…` menu, emoji, comments and border colour on nodes; orthogonal
non-overlapping edge routing for brace, flow and multi-flow; and bespoke
layouts that make bridge, circle, double bubble and brace look like their own
notation rather than variations on one drawing.

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
