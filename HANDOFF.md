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
- This session starts at `d755608` — `git log --oneline d755608..HEAD` lists it
  (39 commits at the time of writing)
- Check port 3000 before assuming the dev server is up or down

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **190 / 190** (142 at session start) |
| `npm run build` | green on the last code commit |

Four tests need Postgres (`docker start kanovra-db`). No `DATABASE_URL` is a
legitimate skip; configured-but-unreachable is a failure.

**Two migrations were added.** Both additive, no data-loss warning, both must run
on the VPS at deploy:

- `20260818041355_add_mind_map_comment_reads`
- `20260818180704_add_deleted_task_snapshots`

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
- The `…` menu on a map node, after the control-scale fix.

---

## 5. What has never been seen working

The assistant's in-app browser has **no Clerk session**; it lands on the
marketing page, which is the only route available for looking at shell CSS.
Anything behind sign-in needs the owner.

1. **A bulk status change actually moving cards between columns** on the board,
   and whether the "6 done, 3 skipped" toast reports real numbers.
2. **The star field's density and colours** after the last adjustment.
3. **Circle map segment outlines.**
4. **The unread comment pulse.** Not possible here at all — it needs a comment
   written by somebody else, and the workspace has one member.

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

---

## 8. The working rhythm the owner expects

- They run `npm run dev` themselves and say when it is up or down.
- Build only once they confirm dev is stopped, with the port check and the build
  in one command.
- Commit each coherent piece, with a message that says *why* rather than what.
- State plainly what was not verified, and why. Never read the absence of a
  complaint as success — ask.
- The owner writes in Vietnamese and expects answers in Vietnamese.
