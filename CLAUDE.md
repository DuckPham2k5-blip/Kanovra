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

**A node's controls grow slower than the node.** `controlScale` in
`mind-map-canvas.ts`, with a test that asserts the invariant rather than the
formula. The `+`, the `…`, the comment badge and the resize grip are *overlays*,
and this has been wrong twice in opposite directions: fixed-size froze them into
specks on a large node, and scaling one-for-one grew them until they covered the
node — hiding the grip in its corner and giving the `…` a bounding box so large
that Radix opened its menu out of the pointer's reach. A square root, floored and
capped, sits between the two.

**A Radix menu trigger keeps its own `pointerdown`.** The rule that every control
over the canvas must swallow its press applies to plain buttons; a trigger's
press belongs to the library, which uses it to open the menu, seed focus and arm
the dismiss layer. Stopping it there was tried and left every item inside the
menu unreachable. The node's own handler already stops the press before the
viewport can turn it into a pan, which is all a trigger ever needed.

**A bulk edit reuses `updateTask`'s body, and is one request.**
`applyTaskUpdate` in `server/actions/task.ts` holds everything one update does
minus the auth and the revalidate; the single and bulk paths both call it. The
write is the easy half — what drifts in a parallel implementation is moving the
card to a column whose status matches, stamping `completedAt`, and the activity
and notification fan-out that makes a change visible to whoever is watching.
One request rather than a client loop, because Server Actions are rate-limited
per signed-in user in middleware and a loop over twenty cards spends twenty of
that allowance, so the tail of a selection fails silently. Sequential, not
parallel: twenty concurrent transactions on one project is a deadlock waiting for
a slow database. A stale id is skipped and counted rather than failing the batch;
**delete** checks permission per task, so a mixed selection is partly deletable —
refusing the lot makes it useless on a shared board and deleting everything is a
quiet privilege escalation.

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
  fix it — Radix overwrites it. Mounting the menu after hydration does. The map
  canvas gates all its per-node menus on a `mounted` flag for this reason, and
  node comments deliberately use **one panel for the whole canvas** rather than a
  popover per node: a canvas is an arbitrary number of triggers, which is the
  worst possible shape for that counter.
- **A card in the same colour family as the page wash cannot be rescued by
  darkening it.** The Maps section was lime over a lime map card; two rounds of
  making the card more opaque changed nothing. Section hues are picked by
  measuring distance from the colours that share the page.
- When testing anything by changing the database underneath a running page,
  change the data *first* without notifying and confirm the screen has **not**
  moved. Otherwise a stray reload — or Fast Refresh after a recompile — gets
  mistaken for the feature working.
- **Every gap in a map layout is space between boxes, never a centre-to-centre
  pitch.** A fixed pitch assumes every node is the same size, and node size is
  chosen freely in either direction without limit — a rank-3 node is *wider than
  the sibling gap meant to separate it*. So any map holding one large node
  overlapped, in three of the five structured types, and it looked like a
  rendering fault rather than an arithmetic one. `mind-map-edges.test.ts` asserts
  no two nodes overlap across every type; that is how these were found.
- **Rendering the layouts to an SVG and looking at them catches what tests
  cannot.** Multi-flow drew every arrow parent-to-child, so the cause side read
  as "the outage caused the bad deploy" — backwards, in the one type whose whole
  purpose is direction. The geometry was right and only the meaning was wrong, so
  no assertion would have failed. The same look found a bridge edge overshooting
  its target and coming back at it from behind, because the channel sweep stopped
  204px from the midpoint while the only clear channel sat at 335px.
- **`parseCanvas` validates nodes one at a time, and must stay that way.**
  Validating the array meant a single bad value failed the whole parse, and the
  caller answers an empty canvas by seeding a fresh centre node — so "one node
  had a hue out of range" and "this map has been wiped" looked identical to
  whoever opened it. Losing one node loudly beats appearing to lose all of them.
- **Prisma's `notIn: []` matches everything**, the exact opposite of `in: []`.
  The comment cleanup on map save depends on it; getting it backwards either
  orphans every comment forever or deletes them all on the next save, and neither
  shows up until somebody notices a conversation missing. Pinned in
  `mind-map-comments.test.ts` against a real database.
- **A comment cannot live inside `MindMap.data`.** A map is one JSON document
  saved explicitly and all at once, so a comment in the blob is overwritten the
  next time anybody saves their own version of the drawing — silently, because
  whoever lost it was not looking at the map when it happened. `nodeId` points
  into the JSON with no foreign key, which has two consequences, both handled:
  the server checks the id is really in the *saved* map before writing (so a node
  only drawn, never saved, has no comment control yet), and comments whose node
  is gone are cleaned up **on save**, not on delete — deleting a box in an unsaved
  document is not a decision yet.
- **The assistant's in-app browser has no Clerk session**, so it lands on the
  marketing page and cannot reach a workspace. Anything behind sign-in has to be
  driven from the owner's own signed-in browser. Map geometry was verified instead
  by rendering the real layout, routing and notation modules to an SVG from a
  throwaway test under `src/`, rasterising it with the `sharp` already in
  `node_modules`, and looking at the picture. The test has to live under `src/` for
  Vitest to resolve the `@/` alias, and the script has to run from the project
  root for `sharp` to resolve — both were briefly done the other way round and
  neither works.
- **Check for a listener on port 3000 *immediately* before `npm run build`, not a
  few steps earlier.** The existing note about not building under a running dev
  server is not enough on its own: the check was done, then `.next` was deleted,
  then the owner restarted dev, and only then did the build run — which failed
  with `Cannot find module for page` on routes nothing had touched, *and* left the
  owner's dev server with a clobbered chunk map. The gap between checking and
  building is the whole bug.
- **`git commit -m` with a PowerShell here-string splits the message into
  pathspecs.** `git commit -m @'…'@` does not pass one argument; git receives each
  word and reports `pathspec 'outage' did not match any file(s)`. Write the message
  to a file and use `git commit -F`. Same lesson as the bash-heredoc note above:
  the shell is not a good way to hand multi-line text to a program.
- **Adding a `.default()` field to `canvasNodeSchema` makes it *required* on
  `CanvasNode`.** Zod's inferred output type has no idea the value was defaulted, so
  every place that builds a node by hand stops compiling — seed, add-child, and two
  test helpers. That is the right failure, but the constants have to live somewhere
  both the schema and those callers can reach (`DEFAULT_WEIGHT`,
  `DEFAULT_THICKNESS`) or they drift, and a node built with no weight lays out as
  zero-width.
- **Every HTML control layered over the map canvas must swallow its own
  `pointerdown`.** Three separate dead-button incidents have had this one cause: the
  press bubbles to the viewport, the viewport captures the pointer to pan, and the
  click never lands. The subtle variant is an early `return` placed *before* the
  `stopPropagation()` — the press is then only stopped for people who can edit, so a
  read-only viewer's comment button silently does nothing. Dropdown *contents* are
  exempt, because Radix portals them to the document root and they are not over the
  canvas at all; that is why the menus worked while the triggers opening them did
  not.
- **GitHub push protection reads Clerk's `sk_test_` placeholder as a Stripe key.**
  `sk_test_` followed by ~24 plausible characters matches GitHub's Stripe secret
  pattern, and the entire push is rejected over a string of x's in `.env.example`.
  Placeholders have to break the shape — `sk_test_<your-clerk-secret-key>`. Verified
  false positive: no real key has ever been committed, and `.env` has never been in
  the history.
- **Removing a value from a Prisma enum is a delete, and the order is fixed.**
  Postgres cannot drop an enum value in place, so Prisma rebuilds the type and casts
  the column across — and that cast fails while any row still holds the old value.
  The `DELETE` has to live *inside* the same migration, before the swap. Doing it by
  hand first works on this machine and fails on the VPS, where nobody has pre-cleaned
  the data. `prisma migrate dev` also refuses to run non-interactively once it has a
  data-loss warning to show, so the migration is hand-written and applied with
  `prisma migrate deploy`.
- **Excising a block from a file by index needs the block to actually come first.**
  Cutting from `describe("circle map"` to `describe("double bubble map"` duplicated
  both blocks instead of removing one, because circle came *after* double bubble in
  the file and the end index was lower than the start. Typecheck caught it; a
  looser test file would not have.

---

## State and what is left

All application work asked for so far is committed to `main` and green:
typecheck, lint, 172 tests, production build.

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

**Mind maps.** A new section with the eight Thinking Maps — six of them now; see
the fourth pass. Circle, bubble and
double bubble are free canvases; the other five are laid out from their
structure and cannot be dragged. The canvas is an unbounded plane — pan and
zoom are one transform, not a scrollable box, which is what a fixed sheet
could not do. Node size is chosen when a node is made, in either direction
without limit, rather than derived from depth.

**Known feature gaps** versus comparable products, in no particular order: task
dependencies (blocked by / blocks), saved and shareable filter views, recurring
tasks, actual time tracking (`estimate` exists, actuals do not), project
templates, keyboard shortcuts beyond ⌘K, undo, CSV export, public read-only share
links. *(Multi-select and bulk actions are done — see the decision above.)*

---

## Built after the second pass (2026-08-12)

Everything on the maps list from the first pass is done. Five commits, each
green on typecheck, lint, tests and a production build.

**Edges are routed, not drawn between centres.** A route is a list of points:
out of the side facing the target, right angles, onto the target's boundary,
around whatever is in the way (`mind-map-edges.ts`). Centre-to-centre put the
line *underneath* the boxes at both ends and hid every arrowhead behind its own
target — and nobody reports a missing arrow when the arrow is simply behind
something. Three families of route are tried in order of how ordinary they look
and the first clear one wins; when nothing is clear the most natural route is
drawn anyway, because a line clipping a box beats a missing line.

**Node size lives in the library**, so the geometry that is *drawn* and the
geometry that is *routed around* are the same numbers. Height used to be left to
the content, which meant any attempt at avoiding a node would have been avoiding
a guess. Text that outgrows its box scrolls inside it rather than reshaping the
box and silently invalidating every route on the map.

**Brace, bridge and circle have their own notation** (`mind-map-notation.ts`).
A brace map is one bracket spanning each group, not a line per part. A bridge map
is one long line with words astride it. A circle map is a circle inside a dashed
frame of reference. For those three the mark *is* the connection, so the
per-edge routes are not drawn at all — a bracket with lines through it reads as
a mistake rather than as either notation. The per-node inner ring went with them:
eight small rings inside one big one reads as a rendering fault.

**Double bubble is the one type whose shape depends on its contents.** It has two
subjects, and a quality either belongs to one or is shared by both — which
parenthood cannot express, because a shared quality touches two bubbles and a
node has one parent. So a node carries a `role` (`subject` / `shared`), set from
its own menu, kept on the node rather than modelled as a second parent link,
which would make every walk, layout and orphan check handle graphs to express a
fact true of exactly one map type. Structured only once a second subject has been
named; before that it is an ordinary bubble map, which is what it is.

**Nodes have a `…` menu, an emoji and a border hue.** Fixed sets, not pickers:
free colour lets somebody choose a border indistinguishable from the backdrop,
and a thousand emoji make marking a node slower than typing the word. Only the
border is tinted — colouring the fill too put nine washes on one backdrop and the
map stopped reading as one drawing.

**Presence and comments per node.** Presence rides the ordinary heartbeat as an
opaque scope string (`map:<mapId>:<nodeId>`) in `User.focus`, so being on a node
decays the same way being in the workspace does. A focus change polls immediately
instead of waiting for the next scheduled heartbeat: ten seconds between clicking
a node and anyone seeing you on it is long enough for two people to overwrite each
other before either ring appears. The scope is chosen by the caller's own browser
and handed back to their teammates, so **nothing renders it** — clients compare it
for equality to decide whether to draw an avatar. Comments are rows in
`MindMapComment`, not another field in `MindMap.data` — see the trap below.

**What this pass did *not* verify.** Nothing was seen in the running application.
The assistant's browser has no Clerk session, so the geometry was checked by
rendering the real modules to a picture and looking at it (see the trap), and the
rest by typecheck, lint, 118 tests and a production build. Specifically unproven
in a browser: the `…` menu opening without a hydration warning, an emoji or border
colour surviving a save and reload, a comment posting and appearing, and a second
person's avatar arriving on a node. The comment cleanup query *is* proven against
the real database. Per-node presence has the same gap as workspace presence: it
has never been exercised by two genuinely different signed-in sessions.

---

## Built after the third pass (2026-08-13)

**The circle map is not a Thinking Maps circle map any more.** It is a radial
sunburst, redrawn from the owner's sketch: the title in a hub, branches fanning
out as ring segments, each free to split into narrower segments further out. The
old ring-with-detail-loose-inside and its dashed frame of reference are gone, and
so is its question — a wheel answers *how does this break down, and how much of it
is each part*, because the angle a branch occupies stands for its share of the
whole. Existing rows keep their `x`/`y`; those fields are simply not read, which is
the same policy the structured types already had.

**Angles are shares, never stored positions** (`mind-map-radial.ts`). A branch
keeps a `weight` and its span is its share of whatever its parent has. That single
decision is what makes the editing safe: splitting into three is three children of
weight 1, deleting one hands its angle back to its siblings, widening one narrows
its neighbours — and none of them can produce a child sticking out of its parent, a
gap in the middle of a ring, or two segments on top of each other. With absolute
angles every one of those is a case to police, and the first one missed draws a
wheel that is visibly wrong with nothing asserting otherwise.

**Radius accumulates down a branch, not across a ring.** A node's inner radius is
the hub plus the thickness of each of its ancestors, so dragging one branch longer
pushes *its own* descendants outward and leaves its siblings alone. A per-ring
thickness would be simpler and would make one long branch fatten everything beside
it.

**Rotation is one SVG transform over memoised children.** Writing to the wheel's
start angle on every pointer move re-runs the layout, rebuilds every path and
reconciles the lot sixty times a second. The live angle goes onto a `<g transform>`
whose contents are a `React.memo` component, and the real value is written once on
release. The owner asked for the turn to be smooth and not stutter; this is that
requirement met structurally rather than by tuning.

**Three grips, not a draggable segment body.** Hub rim turns the wheel; the
selected branch's outer edge sets how far it reaches; its trailing boundary trades
width with the next branch. A segment is already the thing you click to select and
the thing carrying the label, and making one press mean three things depending on
where in the shape it landed is how a drawing becomes guesswork. The rotate grip
sits *outside* the rotating group, or it slides out from under the pointer. The
width grip only appears where there is a neighbour to trade with — the last edge of
the last branch would have to take its angle from everybody at once.

**One segment at a time carries the furniture.** A wheel has nowhere to hang
per-segment controls the way a box has corners, and a menu trigger per segment is a
wheel's worth of Radix `useId` counters — the exact shape behind the hydration
warnings already recorded. Clicking selects; the selection carries the `…` menu, the
comment button and the presence avatars.

**Traps found by rendering it and looking:**

- Labels were dark ink on every fill, which is legible in the light outer rings and
  unreadable on the dark inner ones — where the branch names people navigate by
  actually live. Fill and ink are now one function of the same lightness
  (`radialShade`), because choosing them apart is how that happens.
- Every label was forced along its arc, so long words in the outer rings were
  squeezed into an arc a fraction of their length. A label now runs tangentially or
  radially, whichever it fits, and the flip that keeps it right side up is decided
  from the **drawn** angle rather than the branch's — the two are a quarter turn
  apart for tangential text, so testing the branch angle left every label across the
  bottom of the wheel upside down, and only across the bottom.
- An arc command from an angle back to the same angle has zero length and draws
  nothing, so a single branch filling the whole wheel came out invisible. A full turn
  is built from four arcs.

**What this pass did *not* verify.** Nothing was seen in the running application,
for the same reason as before — the assistant's browser has no Clerk session. The
geometry was checked by rendering the real modules to a picture and looking at it,
and the rest by typecheck, lint, 148 tests and a production build. Specifically
unproven in a browser: any of the three drags actually feeling smooth under a real
pointer, the rotate grip staying under the finger, a wheel of two hundred segments
staying responsive, and whether the hub is big enough to type a real title into.

---

## Built after the fourth pass (2026-08-17)

**Four dead buttons, one cause.** See the `pointerdown` trap above. The fixes were
the early `return` in `onNodePointerDown`, the wheel's hub, and the wheel's
selected-segment furniture.

**Bridge and double bubble are gone.** Not hidden — removed. The enum values, the
13 rows, the layouts, the notation, the glyphs, the `role` field on a node and the
tests all went. There are six map types now.

It happened in two steps on purpose. The first withdrew them from the interface
while keeping the enum, because rows existed and deleting them is irreversible; the
second, once the owner had actually been asked, removed everything. The 13 rows were
listed before deleting and were all throwaway test data with no comments, and the
database was dumped to the scratchpad first.

Two things did *not* go:

- **The `activities` rows** saying "… started a bridge map". They have no foreign
  key to a map, so they survive on their own, and they are true — it did happen.
  Deleting them would mean matching on message text, which would also catch a task
  genuinely named "bridge map". A log is not rewritten to match a later product
  decision.
- **`trimStraight`** in `mind-map-edges.ts`, which looked like double bubble's but
  is still what the bubble map draws with.

Two signatures got simpler as a result, and that is the part worth noticing:
`isStructured` and `replacesEdges` both took the whole node list purely so a double
bubble could be structured only once its second subject was named. They take a type
again. `edgeAxis` likewise took two rectangles only because a bridge map ran along
one axis and stacked its pairs across the other.

**Verified:** typecheck, lint, 142 tests, a production build, the database (six
types, six enum labels, no orphaned comments), and the remaining five types rendered
to a picture and looked at. **Not verified:** anything in a signed-in browser — in
particular that the Maps page now shows six cards, and the four button fixes, which
only a real pointer can prove.

---

## Built after the fifth pass (2026-08-17)

**A node is resized by dragging its corner.** This closes the "dead button"
report for good, and the diagnosis behind the fourth pass turned out to be right
but beside the point: the three size options really did add a node rather than
resize one, and relabelling them so they said so did not help, because the owner
was never looking for an add menu. `+` is one press and one node now — inheriting
its parent's size, the only one of the three that asked nothing of the author —
and size is a grip on the node itself, which says what it does without a label.

**The drag is proportional, not pixels-per-rank.** Move the pointer 1.5× further
from the node's centre and the node is 1.5× the size. Rank is geometric, so a
fixed pixels-per-step would behave differently on a large node than a small one.
`rankFromRatio` is the inverse of `rankScale`, and the test asserts the promise
rather than the formula — drawn size after ÷ drawn size before equals the ratio
the pointer travelled, across three starting sizes.

**`rank` is fractional now.** It was `.int()` while the only way to change size
was a menu stepping by one. A step is 22%, so keeping whole numbers under a
continuous gesture snaps the shape in 22% jumps beneath a pointer moving
smoothly, which reads as the *drag* stuttering rather than as sizes being tidy.
Existing integer data stays valid; the menu and a new node still produce whole
numbers.

**The node's centre is frozen when the press lands**, not read again each move.
On the structured types the layout is computed from the nodes, so growing one
shifts it — and measuring against a centre that moves *because of the change
being measured* is a feedback loop, which is how a drag runs away from the
pointer. Frozen, the response stays monotonic.

A ratio of zero, negative or `NaN` has no logarithm and would put `NaN` into the
node: a box with no size, saved over the real value. `rankFromRatio` answers
those by leaving the rank alone, pinned in `mind-map-canvas.test.ts`.

The `…` menu keeps "Make it bigger" / "Make it smaller". A drag is a mouse and
only a mouse; removing them would leave anyone on a keyboard with no way to
resize a node at all — a worse bug than the one that started this, and a silent
one rather than one that merely looks broken.

**Verified:** typecheck, lint, 151 tests, a production build, and — for the first
time in this strand of work — **the owner drove the real thing and reported the
drag smooth**. The build was run with the port-3000 check and `npm run build` in
one command, so nothing could start between them; that gap is the whole of the
trap recorded above. **Not verified:** the drag on a structured type, where the
frozen-centre trade-off is the one that could still feel loose.

---

## Built after the sixth pass (2026-08-18)

Fifteen adjustments asked for in one list, delivered in five commits. What is
worth knowing before changing any of it back:

**Saving is automatic now, and that reversed a decision this project had made on
purpose.** The old note — still worth reading, at the top of `mind-map-canvas.tsx`
— was that an autosave firing mid-sentence turns every half-formed idea into
something the whole team can see. It was outweighed by the failure at the other
end, which actually happened. Two costs came with it and neither is fixed:

- **Two people on one map now overwrite each other continuously**, because a save
  writes the whole document and the explicit press was what made that rare. Real
  merging is per-node and is separate work.
- **Comments are no longer deleted when their node goes.** The sweep on save was
  safe when a save was deliberate; on a 1.2s timer it would destroy a thread a
  moment after a mis-click with nobody watching. An orphan is hidden instead —
  nothing reads a comment whose node is absent — and the row stays recoverable.
  `mind-map-comments.test.ts` pins the rule in the new direction against a real
  database. The `notIn: []` trap below is now history rather than live code.

**A node has a `kind` (`step` / `note`), and only a flow map reads it.** A flow
map needs two sorts of child, and `parentId` cannot express the difference: the
chain has to *be* a chain in the parent links, or the arrows — drawn parent to
child — fan out of the first box instead of running through them. A scalar on the
node, not a second parent link; that distinction is what made the old double
bubble `role` acceptable and its alternative not.

**A flow map wraps and doubles back**, on a width budget rather than a step count,
because node size is free and four large boxes are wider than eight ordinary ones.
(That wrap is now only the *seed* — see the seventh pass.)
Explanations hang in a column under their step, and **a second explanation attaches
to the first, not to the step** — two connectors leaving one edge makes the router
take the second out and around, which draws a loop into the box from the side.

**Multi-flow is a free canvas.** Alternating branches left and right by insertion
order meant the layout decided which of somebody's causes were causes. Position
carries the meaning on that type, and the arrowhead is already chosen from which
side a node ended up on. `layoutNodes` no longer gates on `isStructured` because
it is still needed once, to seed a map whose nodes all sit at the origin — without
that, switching to free stacks the map on one point and reads as a wipe.

**The ring round a node is a box-shadow on the node itself**, not an extra
element: it follows the corner radius with nothing restating it, and it cannot
cover the node and swallow a click. Yours is white with a dark hairline under it
(white on the light theme is invisible otherwise); everyone else's is
`colorFromString`, the same colour their avatar already falls back to.

**Ambient motes live in `lib/ambient-motes.ts`, tested, with the canvas loop as a
thin shell.** A `requestAnimationFrame` loop cannot be checked: it does not run in
a hidden tab and paints nothing a test can read. The one bug it had was a
*direction* — both themes shared a destination, so the dark theme spawned motes at
the bloom and pulled them back into it. It ran, it drew, and no still frame would
show it.

### Traps found this pass

- **Neither lint nor typecheck reads CSS.** A comment in `globals.css` closed
  early, left prose sitting as raw CSS, failed the postcss build and served every
  page a 500 — while `npm run lint`, `npm run typecheck` and all 151 tests stayed
  green. Only loading the page found it. Check comment balance after editing that
  file, or open the app.
- **Tailwind tree-shakes unused classes inside `@layer components`.** A class
  written ahead of its usage computes as though it does not exist, which looks
  exactly like a broken rule. Confirmed by probing `animation-name` in the browser.
- **`prefers-reduced-motion` overrides cannot pin a property the animation
  animates.** `scale: 1` beside a running `scale` keyframe changes nothing —
  animations beat plain declarations. The reduced-motion variant needs its own
  keyframes.
- **The assistant's browser can reach the marketing page**, which renders the same
  ambient layer and needs no Clerk session. That is the one route available for
  looking at shell-level CSS. It still cannot composite frames while the pane is
  hidden, so `requestAnimationFrame` never fires and canvas work stays unverifiable
  there.

**Unread comments.** `MindMapCommentRead` is a row per reader per node, holding a
timestamp rather than a flag: a reply after your last look has to make a node
unread again, and a boolean cannot say that without being reset for every reader
whenever anybody writes. The badge shows the unread count while there is one and
the whole thread otherwise, so the number and the red pulse mean the same thing.
Marking read does **not** revalidate — re-rendering the page under a panel that
just opened is a jolt for a change the reader already knows about — so the pulse
is cleared in the browser instead, or it flashes at the person reading it.

**Verified:** typecheck, lint, 160 tests, a production build, both new flow
layouts rendered to a picture and looked at, the new table inspected in Postgres,
and — in a browser — that the page returns 200, the mote canvas mounts at the
right size, `align-content: center` applies to a node label, and the pop
animation degrades to fade under the reduced-motion preference.
**Not verified:** anything needing a pointer or a signed-in session. The unread
pulse in particular needs a comment written by somebody else, which has never
been possible here — every teammate so far has been simulated.

---

## Built after the seventh pass (2026-08-18)

Four follow-ups after the owner saw the sixth pass running.

**The motes are stars.** Brightness peaks at 0.95 on dark with a halo and a white
core on the largest few; sizes are biased small, because a uniform spread reads as
confetti rather than as a sky. Each twinkles on its own rate — one shared rate
makes the whole field pulse as a single object.

**On the light theme they are flatly black**, not a dark mix of the accent: on a
pale page the accent at any weight is a smudge of colour where the effect wants a
speck of ink. `moteInk` is a function with its own test precisely because that is
a rule somebody later tidies into a mix for consistency.

**Flow maps are a free canvas too.** The wrap is a good starting arrangement and a
bad rule — a procedure has steps that belong side by side and asides that belong
out of the way, and a width budget cannot tell which is which. `layoutNodes` still
draws the wrapped rows once to seed a map whose nodes all sit at the origin, the
same mechanism multi-flow uses. Only tree and brace are laid out now.

**A circle map's segments carry their own outline.** The padding between them is a
gap, and a gap separates two shapes only while what shows through is a different
colour from both — on a wheel of one hue, neighbours met across a few pixels that
read as part of whichever was darker, so a branch and its child looked like one
wedge.

**The node resize handle is invisible.** Same corner, same drag, no button — the
`nwse-resize` cursor is the affordance, as on a window or a textarea. It stays an
*element* rather than a hit test inside the node's own `pointerdown`, because it
needs the pointer capture and has to swallow the press before the viewport turns
it into a pan.

### Trap found this pass

- **A canvas sized from `window.innerWidth` on mount is 0×0 forever in a
  background tab.** A page loading in a tab that is not visible gets a viewport of
  zero, sizes to zero, and never hears another `resize` — *showing* a tab fires no
  resize event. Measure the parent with a `ResizeObserver`, which fires when the
  element first **gains** a size; ignore zero rather than storing it, and skip an
  unchanged size so a slow window drag does not rebuild the field every frame.
  Found by opening the page and reading `width: 0px` off the element, not by
  reasoning about it.

**Verified:** typecheck, lint, 163 tests, a production build, and the canvas
sizing checked in a real browser before and after the fix. **Not verified:** the
motes moving or their colours — the preview pane does not composite, so
`requestAnimationFrame` never runs there, which is why direction, brightness and
ink are unit-tested instead.

---

## Working style the owner expects

Verify claims rather than asserting them — render an image and look at it,
run the config through the real tool, write the failing test first. Several
bugs in this project were found only because a check was run instead of
reasoned about, and several wrong diagnoses were shipped when it was not.

Say plainly what was not verified and why.
