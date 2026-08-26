# Kanovra — session handoff

Paste this whole file as the first message of the new chat.

`CLAUDE.md` loads automatically in every session and already carries the
architecture, the decisions and the traps — **including everything built in this
session**, written in as the work went. Do not re-summarise it.

This file holds only what `CLAUDE.md` cannot: the current state, what has been
proven, what has not, and what is open.

---

## 1. State

- Working directory: `C:\Users\PC\OneDrive\TaskForge`
- Branch `main`, working tree clean
- This session starts at `4728cc9` — `git log --oneline 4728cc9..HEAD` lists it
- Check port 3000 before assuming the dev server is up or down
- **All four checks are green on `8187efb`**, the build included. It was run with
  the port check in the same command, which is the only way this project runs it.

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **301 / 301** (240 at session start) |
| `npm run build` | clean |

Seventeen tests across five files need Postgres (`docker start kanovra-db`).
No `DATABASE_URL` is a legitimate skip; configured-but-unreachable is a failure.

**Eight migrations are waiting for the VPS**, and they must run at deploy **in this
order**:

- `20260818041355_add_mind_map_comment_reads` — additive
- `20260818180704_add_deleted_task_snapshots` — additive
- `20260821035544_add_mind_map_palette` — additive, two nullable columns
- `20260821085208_add_mind_map_background` — additive, two nullable columns
- `20260821143000_remove_flow_map` — **destructive**: deletes every FLOW row,
  then rebuilds the `MindMapType` enum without it. Hand-written, applied with
  `prisma migrate deploy`; `migrate dev` refuses non-interactively once it has a
  data-loss warning. The `DELETE` must stay *inside* it — pre-cleaning by hand
  works here and fails on a VPS where nobody has.
- `20260824101500_add_task_dependencies` — additive, one new table. Hand-written
  for the same reason: `migrate dev` regenerates the client, and the generator
  cannot take the engine DLL from a running dev server.
- `20260824223000_add_saved_views` — additive, one new table.
- `20260824225500_add_task_recurrence` — additive, one nullable column, no backfill.

---

## 2. GitHub — paused, nothing pushed

`origin` points at an **empty** repository. The owner paused all GitHub work and
has not lifted it. Do not push, open a PR, or touch the remote unless asked.

The push-protection block is a **verified false positive**: `.env.example` in
commits `4ec2526` and `d6fb82f` holds the placeholder
`sk_test_xxxxxxxxxxxxxxxxxxxxxxxx`, and Clerk shares Stripe's `sk_test_` prefix.
No real key has ever been committed. The accepted recommendation stands: use
GitHub's unblock URL rather than rewriting history.

---

## 3. What was built

The reasoning for each is in `CLAUDE.md`.

**Built 2026-08-24, after the handoff above**
- **A document this build cannot read is no longer replaced by opening it.**
  `parseCanvas` reports `unreadable`, and the canvas declines to start dirty on
  it, so autosave stops destroying a map 1.2s after somebody merely looks at it.
  The outer arrays are sliced rather than `.max()`-capped. Proven against all 104
  real rows: one flagged, 53 empty maps still saveable.
- **A save carries the version it was based on**, as a canonical fingerprint of
  the document rather than the row's `updatedAt` — rename, colour and background
  write that row without touching the drawing. On a conflict the canvas holds,
  says so, and offers both ways out. No migration.
- **Recurring tasks.** Finishing one makes the next; the rule moves with it. No
  scheduler, because PM2's two workers would run one twice. Driven by the owner
  through four cycles.
- **Filters in the URL, and saved views.** A narrowed list can be linked to,
  reloaded and shared; a set of filters can be named, kept private or shared with
  the workspace. Driven by the owner, sharing aside.
- **Task dependencies.** One task waits on another; a loop is refused; the card
  says "Waiting on N" and the panel holds both directions. Completing a blocked
  task is allowed and reported rather than refused. Undo carries the edges both
  ways. Reasoning in `CLAUDE.md`; driven by the owner end to end.
- One bug in that, found and fixed the same day: a `Json` column rounds a
  17-significant-digit double, so fingerprinting the document the action *meant*
  to write made **every drag** conflict with a version that never existed. The
  version comes from `RETURNING` now. See the trap in `CLAUDE.md` and section 7.

**Maps**
- The Maps page lists existing maps behind filter chips that open and close. It
  used to show six "make a new one" cards and hide 59 maps in a `…` menu.
- Node legibility: stronger border, label centred both ways, bubble children no
  longer faded.
- Node selection, a lit presence ring (yours white, others in their own colour),
  Delete / `+` / `-` on the selected node.
- Comment badge on the node's left edge; unread comments pulse red and clear when
  the thread opens (`MindMapCommentRead`).
- **Autosave** replaced the Save button — this reversed a decision the code
  documented, and brought two costs with it. See `CLAUDE.md`.
- Flow map: square corners, right-angled arrows, wrapping rows, explanation boxes
  under a step. Flow and multi-flow are **free canvases** now, seeded once from
  the layout they used to compute.
- Circle map segments carry their own outline.
- The resize handle is invisible: the corner and the cursor are the affordance.
- **Undo/redo** (Ctrl+Z, Ctrl+Shift+Z, and two buttons).

**Tasks**
- **Multi-select and bulk actions** on board and list: status, priority,
  assignee, delete. One request per selection, never one per task.
- **Undo a delete**, single or bulk, in the toast for 12 seconds.
- Subtasks fold under their parent on the **project list**. On **My tasks** they
  stay standalone rows naming their parent, because assignment does not follow
  the tree.
- One checkbox per row, meaning "done". Selection is a select-all in the header,
  plus click / Ctrl-click / Shift-click on rows.
- A trash icon on each row, revealed on hover, deletes one task with Undo.

**Shell**
- Ambient star field on every page, direction and colour by theme.

**Map appearance** (the ninth pass — reasoning in `CLAUDE.md`)
- A map has its own colour: a hue anywhere on the circle and one of four tones,
  in two nullable columns. Not a free colour field, and the reason is written
  down.
- A node has its own colour: one to four hex stops with a direction, stored in
  the document. The label's ink and the node's edge are computed from it.
- Thirteen backgrounds drawn as SVG data URIs, plus a box for a link to any
  picture — https only, checked once on the server, and guarded by a regex
  because the value lands inside a CSS `url(...)`.
- Three lights drift behind the drawing. **This surface deliberately ignores
  `prefers-reduced-motion`**; the switch at the top of the appearance panel is
  how anybody stops it, per person, in their own browser.
- Zoom runs 0.02 to 40.
- **Flow is removed.** Five map types. The node's `kind` went with it.

---

## 4. What the owner has actually seen working

Everything here was confirmed on their own screen.

- The whole task list: subtask fold and its counts; search showing a matching
  subtask instead of only its parent; click-to-add-and-remove once a selection
  exists; a chosen parent carrying its subtasks into a delete while the count
  still reads the number picked; the per-row delete; the parent-name breadcrumb
  on My tasks.
- Undo on a task delete — all four cases: the toast button, a bulk delete undone
  in one press, a second press staying silent, and 12 seconds being enough.
- Undo/redo on the map canvas.
- Card dragging on the board, alongside multi-select.
- A bulk status change: the cards move to the matching column, and the toast
  reports the number of tasks chosen.
- Project and notification icons after the icon registry replaced the namespace
  import.
- The palette button on a map node opening the colour panel, after the same
  action inside the `…` menu did nothing.
- The appearance panel: the drawn backgrounds, and a map keeping one across a
  reload.
- The flow map type gone from the picker and the list.
- Every row of a map node's `…` menu, once the node stopped swallowing presses
  meant for a control: Change colour, Add a comment, Remove, and Split on a
  wheel.
- The `…` menu on a map node, after the control-scale fix.

Added this session:

- **The map version guard, in both directions.** It refused a save when the
  document had genuinely moved — caught in the diagnostic log at 02:35:12, with
  the two documents dumped side by side — and it accepts an ordinary drag now
  that the version is taken from the row as stored. The owner dragged nodes
  repeatedly with no conflict, and the row's `updatedAt` moved with each.
- **The conflict banner itself**, wording included: it appeared on the owner's
  screen, and its first wording accused a teammate in a workspace with one
  member, which is how that got fixed.
- **Everything on the 2026-08-25 test list, all five parts.** Recurring tasks
  (the rule moves, the date counts from the previous due date); filters in the
  URL; saved views including the `?task=` guard, proven by reading the stored
  query; task dependencies (hidden finished links, the card chip, the warning
  toast, the loop refusal offering exactly the eight legal candidates); and the
  map — **all three rows of a node's `…` menu and all seven of a wheel's**, plus
  Split, Add a branch, Remove with Ctrl+Z, and pan.

  The map menus matter most. They had been confirmed by one canary row only, and
  this codebase has had four separate dead-menu incidents on that canvas. There
  are now two node colours in the database — `#ca8a04` and `#22d3ee` — which is
  the same evidence that exposed the last one.

  Two bugs came out of the owner using it, neither reachable by any test: the
  repeat toast did not name the new due date, so four ticks read as one task
  ticked four times; and the search box lost characters while the URL caught up,
  which surfaced on Vietnamese input because a diacritic is a second keypress on
  a letter already typed.
- **The dependency panel**, with real links in both directions. Two rounds of
  wording came out of that look: "Waiting on" / "Waiting on this" differed by one
  trailing word while meaning opposite things and had to be explained twice, so
  they are "Blocked by" / "Blocking" with a line each; and a finished link is now
  hidden rather than struck through.
- **A document this build cannot read surviving being opened.** The owner opened
  the legacy circle map `cmspfqp5o0001urg46v4g2ne0` ("Businesses", workspace
  `acme-product`) and saw the amber banner, and the row still held
  `{"centre": "Businesses", "context": [...]}` afterwards — untouched for 71
  hours. Both halves matter: the banner proves the page rendered, so autosave had
  its 1.2 seconds and declined to take them. Before the fix, merely opening that
  page replaced the document.

---

## 5. What has never been seen working

The assistant's in-app browser has **no Clerk session** and is bounced to
`/sign-in`. The marketing page is no longer a way round it either: the pane
refuses to screenshot at all while it is not displayed, so nothing renders there
to look at. The Claude in Chrome extension — the one route that would carry the
owner's own session — is not connected. Anything behind sign-in needs the owner.

1. **The star field's density and colours** after the last adjustment.
2. **Circle map segment outlines.**
3. **The unread comment pulse.** Not possible here at all — it needs a comment
   written by somebody else, and the workspace has one member.
4. **The map's drifting lights actually moving**, whether each background moves
   in its *own* way, and whether a **linked picture** paints as a background.
5. **Both buttons on the conflict banner.** The banner has been seen and "Keep
   mine" has been pressed; "Load the saved one" has not.
6. **Sharing a saved view.** Saving, applying and deleting are proven; the
   `shared` switch has never been turned on, so that branch and the globe icon
   beside a shared view are undrawn.

Older, and unchanged by this session:

- **Two genuinely different signed-in Clerk sessions** exchanging updates. Every
  teammate so far has been simulated at the bus or by a fixture.
- **The multi-worker case** the realtime design exists for. Dev is one process.
- **The Nginx config** (`deploy/nginx.conf`) on the VPS.

---

## 6. Open questions and remaining work

**A recoverable bin is an unmade decision.** Undo for a delete is not one: the
snapshot lives on the server for 24 hours, but the only route in is the toast, so
a reload loses it. That was deliberate for "undo what I just did". The owner was
told, and replied *"tạm gác lại điều đấy"* — parked, not refused.

**Nothing is half-finished.** The tree is clean, every check is green on the
commit named in section 1, and each feature below was built, tested and driven by
the owner before the next one started. A new session can begin anywhere.

**Next, in the order the owner and I agreed:**

1. **Deploy.** Eight migrations are waiting for the VPS — section 1 has the order
   and the one destructive rule. `deploy/nginx.conf` is still unapplied, and
   without it SSE connections are cut every 60 seconds and the write rate limit
   is not enforced at the edge. This is the largest gap between what exists and
   what is running anywhere: thirty-two commits, none of them deployed.
2. **GitHub**, which the owner has kept paused all along. Section 2. Do not touch
   the remote unless they lift it.
3. **The next feature**, if they want one. The list is below, smallest first.

**Remaining feature gaps** (from `CLAUDE.md`), roughly by size:

- **CSV export** — the smallest, and easier than it was: the filters now live in
  the URL, so "export what I am looking at" is already expressible.
- **Keyboard shortcuts beyond ⌘K.**
- **Project templates.**
- **Actual time tracking** — `estimate` exists, actuals do not.
- **Public read-only share links** — the largest, and the only one with a real
  security surface: it means serving workspace content to somebody with no
  session at all.

**Technical debt that is not a feature**, and the honest one to name first:

- **Two people on one map still overwrite each other.** The version guard built
  this session makes the loss *audible* — a save based on a stale version is
  refused and the person is offered both ways out — but it does not merge. The
  real fix is per-node saving, and it is a different piece of work.
- **Orphaned map comments are hidden, not swept.** Deliberate: the sweep was safe
  when saving was a deliberate press and is not safe on a 1.2s timer. Currently
  zero orphans, so nothing is accumulating yet.
- **Undo for a task delete has no bin.** The snapshot lives 24 hours but the only
  route in is the toast, so a reload loses it. The owner was told and replied
  *"tạm gác lại điều đấy"* — parked, not refused.

**Only the owner can do these:** set `ANTHROPIC_API_KEY`; rename the app in the
Clerk dashboard; apply `deploy/nginx.conf`; `git push`.

---

## 7. How this session went wrong

Read this before writing code. Each cost the owner a round of testing, and one
destroyed data.

### Three rounds of reading code when one query would have done

The menus were dead for a whole session. What finally located it was not the
render tree — it was the database saying no node on a free canvas had *ever* been
given a colour, which turned "the colour feature is broken" into "this canvas is
broken", and then the theme toggle proving `DropdownMenuItem` works everywhere
else. **Ask the data what the shape of the bug is before reading code for its
cause.**

### Concluding from a fact without checking what the fact was

`[DOMRect]` in the console was read as “the colour panel is mounted and simply
unseen”, and a fix shipped on that reading. Printing the numbers showed `0×0` at
the origin with `z-index: 10` — the shell's own sidebar, hidden because the
window was narrower than `lg`. The panel had never been in the document. Ask what
an element *is* before concluding anything from the fact that it exists.

### Reading a class name off a screenshot and building on it

One word in a small console screenshot looked like `cursor-default` where the
source says `cursor-pointer`, and a theory about a stale bundle grew out of it
immediately. It was dropped before it reached code, but only because the next
check contradicted it. An image is not a transcript.

### Three rounds of reading code when the answer was in the data

“Change colour does not work on some maps” took three passes through the render
tree, which found nothing, because there *is* nothing — every type mounts the
same panel from the same place. One query settled its shape: no node on a free
canvas had ever been given a colour, and no such map had ever recorded a colour
choice. The rule at the top of this section is about features; it applies to
bugs just as hard.

### Building on an assumption about the data's shape — three times

- The subtask fold required a parent and child to be in the same list. Of the
  fifteen assigned subtasks in this database, **zero** have a parent assigned to
  the same person. It drew nothing at all and looked unbuilt.
- The delete snapshot assumed a selection shares one project. "My tasks" spans
  the workspace. Six tasks deleted across three projects, four restored, **two
  destroyed**. The false assumption had been written down as a comment at the
  call site and then believed.
- The parent-name breadcrumb was built twice: first squeezed to zero width by a
  long title on the same line, then found to have no rows to appear on, because
  the owner holds four tasks and none is a subtask.

Every one was a single query away. What finally settled the last was **running
the real `getMyTasks` from a throwaway test and printing what came back** — not
reading the component and reasoning. Do that first.

### Fixing from a reconstruction rather than an observation

Three symptoms were reported together on the map canvas — menu items dead, no pop
animation, no resize. A coherent single-cause story was built by reading code, a
fix shipped, and **it was wrong**. The second attempt found the real cause. When
a symptom cannot be observed, ask for the first red line in the console or build
a minimal repro outside the sign-in wall. Do not ship a second guess.

### Defensive changes are still changes

`stopPropagation` was added to Radix menu triggers when nothing required it — the
node's own handler already stopped the press. It made every item inside those
menus unreachable. The `pointerdown` rule in `CLAUDE.md` is about plain buttons,
not a library's own trigger.

### Three older rules, all hit again

- Check for a listener on port 3000 **in the same command** as `npm run build`.
- Never hand multi-line text to git through a shell. Write the message to a file
  and use `git commit -F`. The same applies to writing source files through
  heredocs — hit again this session when an escape was mangled.
- Never run the dev server through a tool. The owner runs it in their terminal.

### Two bugs no test could have caught (2026-08-25)

Both were found by the owner using the thing, minutes after every check was
green, and neither is the kind of mistake a test suite is shaped to notice.

**An effect that syncs from a source it also writes to has to know who wrote.**
The search box pushed its value into the URL after 300ms and a second effect
copied the URL back into the box. It could not tell the URL moving *because
somebody pasted a link* from the URL echoing what the box itself had just
written, so it adopted both — and everything typed during that gap was
overwritten by the older value. It surfaced on Vietnamese input and not by
chance: a diacritic is a second keypress on a letter already typed, so almost
every word crosses the gap. The fix is one ref remembering what was pushed.

**A message that is true can still be useless.** Completing a recurring task
said "Next one created." Every occurrence carries the title of the one before
it, so the new row is indistinguishable from the one just finished — and four
completions in a row read as one task being ticked four times, reported as "why
does the number keep going up". It names the new due date now, which is the only
thing that tells them apart.

### A baseline is not a baseline until you know when it was taken (2026-08-25)

Asked to verify the first recurring task, I read the table, saw the numbers I
expected *before* the test, and reported that nothing had happened. The owner had
run it eight hours earlier: what I called "the state before" was already the
state after. The `activities` table said so in one line and I had not looked.

The rule already in this section — ask what a fact *is* before concluding from
it — extends to *when* it is. A snapshot with no timestamp beside it proves
nothing about order.

### A fixture too tidy to contain the bug (2026-08-24)

The map version guard shipped with a round-trip test written specifically to
prove the thing that then broke — and it passed the whole time, because its
coordinates were `240` and `60`. The failure needs a **17-significant-digit
double**, which only a drag produces. Three separate "proofs" were offered to the
owner on the strength of that test before the bug was found.

A fixture for a document format has to come from a real row, or it tests the
shape of the author's imagination. Running the parser over all 104 real rows was
done on the same day, for the other fix, and it was the check that worked.

### Instrumenting beat reading, again

The conflict happened on the owner's screen, in a browser with no session
available here, in a case nobody could reproduce on demand. Three rounds of
reading code produced three wrong theories — two live component instances, Next's
router cache, overlapping saves — and the actual cause was in none of them.

What found it: a temporary block in the server action appending one JSON line per
save to a file, then reading the file. It showed the token the server promised
and the token it computed for its own row differing by one character, and dumping
both documents put the missing digit on screen. **When something cannot be
watched happening, make it leave a record, then read the record.** The
instrumentation was removed in the same session it was added.

---

## 8. The working rhythm the owner expects

- They run `npm run dev` themselves and say when it is up or down.
- Build only once they confirm dev is stopped, with the port check and the build
  in one command.
- Commit each coherent piece, with a message that says *why* rather than what.
- State plainly what was not verified, and why. Never read the absence of a
  complaint as success — ask.
- The owner writes in Vietnamese and expects answers in Vietnamese.
