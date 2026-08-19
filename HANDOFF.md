# Kanovra — session handoff

Paste this whole file as the first message in the new chat.

`CLAUDE.md` loads automatically at the start of every session and already carries
the architecture, the decisions and the traps — **including everything built in
this session**, which was written into it as the work went. Do not re-summarise
it.

This file is only what `CLAUDE.md` cannot hold: the exact current state, what is
unverified, and what is open.

---

## 1. State right now

- Working directory: `C:\Users\PC\OneDrive\TaskForge`
- Branch `main`, HEAD = `f977b3e` plus the commit that updated this line
- **28 commits this session**, on top of `d755608`
- The dev server was stopped for the last build; check port 3000 before assuming

| Check | Result |
|---|---|
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm test` | **188 / 188** (was 142 at session start) |
| `npm run build` | **green**, run after the last feature commit |

All four checks are green on the tip. When running the build again, keep the
port-3000 check and `npm run build` **in the same command** — the gap between
checking and building is the whole of the recorded trap.

### Migrations added this session

Both are additive, carry no data-loss warning, and must run on the VPS at deploy:

- `20260818041355_add_mind_map_comment_reads`
- `20260818180704_add_deleted_task_snapshots`

---

## 2. GitHub — still paused, still nothing pushed

The remote `origin` points at an **empty** repository. The owner paused all
GitHub work early in the previous session and has not lifted it. Do not push, do
not open a PR, do not touch the remote unless asked.

The old push-protection issue is unchanged and is a **verified false positive**:
`.env.example` in commits `4ec2526` and `d6fb82f` holds the literal placeholder
`sk_test_xxxxxxxxxxxxxxxxxxxxxxxx`, and Clerk shares Stripe's `sk_test_` prefix.
No real key has ever been committed. The accepted recommendation stands: click
GitHub's unblock URL rather than rewriting history.

---

## 3. What was built, in one line each

Ordered as it happened. The *why* for each is in `CLAUDE.md`.

**Maps section**
- The Maps page lists the maps you have made, behind filter chips that open and
  close the list. It used to show only six "make a new one" cards, with 59
  existing maps reachable solely through a `…` menu.
- Node legibility: stronger border, label centred both ways, bubble children no
  longer faded.
- Node selection, a lit presence ring (yours white, teammates' their own colour),
  Delete / `+` / `-` on the selected node.
- The comment badge moved to the node's left edge; unread comments pulse red and
  clear when the thread is opened (`MindMapCommentRead`).
- **Autosave** replaced the explicit Save button, which reversed a documented
  decision — see `CLAUDE.md` for the two costs that came with it.
- Flow map: square corners, right-angled arrows, wrapping rows, explanation boxes
  under a step. Flow and multi-flow are now **free canvases**, seeded once from
  the layout they used to compute.
- Circle map segments carry their own outline.
- The node resize handle is invisible — the corner and the cursor are the whole
  affordance.
- **Undo/redo on the canvas** (Ctrl+Z, Ctrl+Shift+Z, plus two buttons).

**Tasks**
- **Multi-select and bulk actions** on the board and the list: status, priority,
  assignee, delete. One request per selection, not one per task.
- **Undo a delete**, single or bulk, offered in the toast for 12 seconds.
- Subtasks fold under their parent in the list, with a count and a chevron. "My
  tasks" never filtered them out, so a subtask used to sit beside its parent as
  though it were a separate task — which is what made deleting four things report
  five. Both counts now mean *tasks chosen*, not rows the database touched.
- The list row has one checkbox again, meaning "done". Bulk selection moved to a
  single select-all in the header, where there is no "done" to confuse it with.

**Shell**
- Ambient star field behind every page, direction and colour by theme.

---

## 4. Never verified

### Needs the owner's signed-in browser

The assistant's in-app browser has **no Clerk session** and lands on the
marketing page. That page is the one route available for looking at shell-level
CSS; anything behind sign-in cannot be seen.

1. **The list's subtask folding and the header select-all** — both written after
   the owner's last test, neither seen on screen.
2. **Bulk actions** — the owner confirmed only that card dragging still works.
   Untested: changing status actually moving cards between columns, Shift-click
   range selection, and whether the "6 done, 3 skipped" toast reports real
   numbers.
3. **The star field's density and colours** after the last adjustment.
4. **Circle map segment outlines.**
5. **The unread comment pulse** — impossible here at all: it needs a comment
   written by somebody else, and this workspace has one member.

### Confirmed working by the owner

- **Undo on a task delete.** Reported as *"ổn cả bốn"* against the four things
  asked: the toast's Undo button, a bulk delete undone in one press, pressing
  Undo twice staying silent, and 12 seconds being long enough.
- **Undo/redo on the map canvas.**
- **Card dragging on the board**, still working alongside multi-select.
- **The `…` menu on a map node**, after the control-scale fix.

### Standing gaps, older than this session

- **Two genuinely different signed-in Clerk sessions** exchanging updates. Every
  teammate so far has been simulated at the bus or by a fixture.
- **The multi-worker case** that motivates the realtime design. Dev is a single
  process.
- **The Nginx config** (`deploy/nginx.conf`) on the VPS.

---

## 5. Open, and worth raising early

**Undo for a delete is not a bin.** The snapshot lives on the server for 24
hours, but the only way in is the toast — reload the page and the route is gone.
That was deliberate for "undo what I just did". The owner was told this and
replied *"tạm gác lại điều đấy"*, so a recoverable bin is a real, unmade
decision rather than a settled no.

**Remaining feature gaps**, from `CLAUDE.md`: task dependencies (blocked by /
blocks), saved and shareable filter views, recurring tasks, actual time tracking,
project templates, keyboard shortcuts beyond ⌘K, CSV export, public read-only
share links.

**Only the owner can do these:** set `ANTHROPIC_API_KEY`; rename the app in the
Clerk dashboard; apply `deploy/nginx.conf`; `git push`.

---

## 6. How this session actually went wrong, twice

Both are worth carrying forward, because they cost the owner real time.

**Fixing from a reconstruction rather than an observation.** Three symptoms were
reported together on the map canvas — menu items dead, no pop animation, no
resize. A coherent single-cause story was built from reading the code, a fix was
shipped, and **it was wrong**; the owner tested and it was still broken. The
second attempt found the real cause. When a symptom cannot be observed directly,
ask for the first red line in the console, or build a minimal repro outside the
sign-in wall — do not ship a second guess.

**Defensive changes are still changes.** Adding `stopPropagation` to Radix menu
triggers was not required by anything; the node's own handler already stopped the
press. It broke every item inside those menus. The rule in `CLAUDE.md` about
swallowing `pointerdown` applies to plain buttons, not to a library's own
trigger.

Three older rules, all in `CLAUDE.md`, all hit again this session:

- Check for a listener on port 3000 **in the same command** as `npm run build`.
- Never hand multi-line text to git through a shell. Write the message to a file
  and use `git commit -F`.
- Never run the dev server through a tool; the owner runs it in their terminal.

---

## 7. If the new session wants a quick sanity check

```bash
npm run lint && npm run typecheck && npm test
```

Expect 188 passing. Four of those need Postgres (`docker start kanovra-db`);
a configured-but-unreachable database is a failure, not a skip.
