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
- **All four checks are green on `fa08f46`**, the build included. It was run with
  the port check in the same command, which is the only way this project runs it.

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **256 / 256** (240 at session start) |
| `npm run build` | clean |

Sixteen tests across four files need Postgres (`docker start kanovra-db`).
No `DATABASE_URL` is a legitimate skip; configured-but-unreachable is a failure.

**Five migrations were added**, and they must run on the VPS at deploy **in this
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
5. **The menu rows after the workaround was unwound.** The owner confirmed the
   canary row ("Add a comment") firing; the other six went back to
   `DropdownMenuItem` on the same reasoning and have not been pressed since.
6. **Both buttons on the conflict banner.** The banner has been seen and "Keep
   mine" has been pressed; "Load the saved one" has not.

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

**Next, in order:**

1. Owner stops dev; run the port check and `npm run build` in one command. Three
   commits have landed since the last green build.
2. Owner presses the six menu rows that were not the canary, and pans the map —
   the press path was touched and only the drag has been exercised since.
3. Five migrations are waiting for the VPS. The last one is **destructive** — see
   section 1 for the order and the rule. **No migration was added this session**:
   the map version is a fingerprint of the document precisely so that no column
   had to be added for it.

**Remaining feature gaps** (from `CLAUDE.md`): task dependencies (blocked by /
blocks), saved and shareable filter views, recurring tasks, actual time tracking,
project templates, keyboard shortcuts beyond ⌘K, CSV export, public read-only
share links.

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
