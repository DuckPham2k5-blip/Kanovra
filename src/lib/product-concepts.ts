import { FOREIGN_SHORTCUTS, SHORTCUTS } from "@/lib/shortcuts";

/**
 * The things that are not a page.
 *
 * `product-guide.ts` answers "where is this control". This answers "how does
 * this work" — sharing, roles, exporting, time, shortcuts.
 *
 * ## Why it exists
 *
 * The assistant page offers openers, and two of them were found to ask
 * questions the guide could not answer. "Keyboard shortcuts" was offered while
 * the grounding said nothing about a single key. "How do I share a board?"
 * asked "what exactly will they be able to see?" while the grounding knew only
 * that the button sits in a menu.
 *
 * An application that invites a question its assistant has to invent an answer
 * to is worse than one that offers no suggestions at all: the reader has been
 * told by the product itself that this was a good thing to ask, so a fluent
 * fabrication arrives with the product's own endorsement behind it.
 *
 * `ai-suggestions.ts` names the concept each opener leans on, and a test
 * refuses a name that is not here — which is what stops the two drifting apart
 * again the next time an opener is added.
 */

export type ConceptEntry = {
  id: string;
  title: string;
  /** Prose, written to be reviewed by a person and not only read by a model. */
  text: string;
};

export const PRODUCT_CONCEPTS: ConceptEntry[] = [
  {
    id: "sharing",
    title: "Public read-only share links",
    text: `A project board can be published as a read-only page that anyone holding the link
can open with no account at all.

To publish one: open the project, press the ⋯ menu at the far right of the
project header, choose "Share board", pick how long the link should last (7, 30
or 90 days, or until you turn it off), then "Create link" and "Copy". This needs
the Admin role or above — a Member cannot publish a board, because handing
content to people outside the workspace is a different kind of decision from
day-to-day work.

While a link is live an amber "Public" chip sits beside the project name in the
header, and pressing it reopens the dialog. Only people who could turn it off
are shown that chip.

What a visitor sees: the project's name, key and description, the columns, and
the cards with their titles, labels, priorities, due dates, checklist progress,
and the name and avatar of whoever a task is assigned to. What they do not see:
email addresses, comments, attachments, time entries, the member list, or any
other project. They cannot change anything, and cards do not open.

To stop it: the same dialog, "Turn off". The link stops working immediately.
"New link" replaces the address with a fresh one, which also stops the old one
working. Neither can un-send an address somebody has already been given.`,
  },
  {
    id: "roles",
    title: "What each role may do",
    text: `Viewer is genuinely read-only. Member does day-to-day work: tasks, comments,
checklists, projects, maps, columns. Admin adds managing people and workspace
settings, archiving and deleting projects, and publishing a board publicly.
Owner adds deleting the workspace and transferring ownership, and is the only
role that can act on another Owner.

Permission is checked on the server every time, so a hidden button is a
courtesy rather than the control itself. Roles are changed on the Members page
by an Admin or above.`,
  },
  {
    id: "saved-views",
    title: "Filters and saved views",
    text: `Every filter on a task list — search, status, priority, assignee — is written
into the address bar, so a narrowed list can be linked, reloaded and reached
with the browser's Back button.

A saved view stores that set of filters under a name. Sharing one with the
workspace hands over the filters, not access: the rows are still fetched under
the usual permission checks, so a shared view can never show somebody something
they could not already see. Renaming and sharing belong to whoever made the
view; an Admin may also delete one.`,
  },
  {
    id: "export",
    title: "Exporting to CSV",
    text: `The Export button on a task list downloads exactly the rows on screen — the
filter and sort as they stand — as a CSV file.

Subtasks are included even when their parent row is folded shut, so the file can
hold more rows than the screen shows. That is why the message afterwards names
two numbers, for example "1 task and 2 subtasks": the count on the toolbar
deliberately counts top-level rows only.

The file opens correctly in Excel, including Vietnamese text. A value that is
absent is an empty cell rather than the dash the screen draws.`,
  },
  {
    id: "time",
    title: "Time tracking",
    text: `A task's estimate is what somebody guessed before starting. Time tracking
records what actually happened, in the Time section of the task panel.

"Start timer" begins one, and starting a timer stops whatever else you had
running, so there is never more than one. "Log time" records minutes by hand for
work already done, up to 24 hours in one entry.

Everyone in the workspace sees everyone's time, because the total is shared —
but you may only stop or remove your own entries. Starting a timer is not
announced anywhere.`,
  },
  {
    id: "dependencies",
    title: "Task dependencies",
    text: `A task can be marked as waiting on another. The task panel shows both
directions, under "Blocked by" and "Blocking", each with a line saying which way
round it is.

A card shows "Blocked by 2" while it is still waiting. Completing a blocked task
is allowed and reported rather than refused: refusing would push people to
delete the dependency, which destroys the record of why the order mattered. A
blocker that is cancelled counts as out of the way, the same as one that is
done.`,
  },
  {
    id: "recurring",
    title: "Repeating tasks",
    text: `A task can carry a repeat rule. The next occurrence is created when the current
one is completed rather than on a schedule — so a task nobody finishes never
returns, and a skipped week does not pile up copies.

It is a new task rather than a moved due date, so the record that the previous
one was done survives. The next date counts from the previous due date, so a
Monday report stays on Mondays even when it is finished on a Wednesday.`,
  },
  {
    id: "bulk",
    title: "Selecting and changing several tasks",
    text: `On a task list the checkbox on a row means "done" and nothing else. To choose
rows for a bulk change, use the select-all checkbox in the header, or Ctrl-click
and Shift-click on rows.

A bulk change can set status, priority or assignee, or delete. Deleting checks
permission on each task, so a mixed selection can be partly deletable. The count
reported afterwards is the number of tasks you chose.`,
  },
  {
    id: "undo",
    title: "Undoing a delete",
    text: `Deleting a task offers an undo in the message that follows. Restoring brings
back the task with its subtasks, checklist, comments and attachments. Only the
person who deleted it is offered the undo.

On a mind map, Ctrl+Z undoes and Ctrl+Shift+Z redoes. A word typed counts as one
undo and a whole drag counts as one undo, rather than one step per keystroke or
per frame.`,
  },
  {
    id: "templates",
    title: "Project templates",
    text: `When creating a project you can start from a template, which builds the board's
columns — with their statuses and any WIP limits — a few labels, and sometimes a
handful of starter tasks.

A template copies the board and the labels and nothing else: not a colour, icon,
banner or dates, because those are what make one project distinguishable from
eleven others in a sidebar. Labels the workspace already has are reused rather
than duplicated. The picker appears only when creating a project — a template
cannot restructure a board people are already working on.`,
  },
  {
    id: "maps",
    title: "Mind maps",
    text: `Maps are diagrams for working an idea out, kept separately from tasks. The kind
of map is chosen when it is created and cannot be changed afterwards.

The canvas is an unbounded plane: drag the background to pan, use the wheel to
zoom. A node's + adds one child; its bottom-right corner resizes it by dragging,
with no button, because the resize cursor is the affordance. The ⋯ menu on a
node holds its colour, an emoji, bigger and smaller, and delete.

Saving is automatic about a second after you stop, so there is no Save button.
If two people edit one map at once the second save is refused with a banner
offering both ways out, rather than one quietly overwriting the other.`,
  },
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    // Filled in from the real table at render time — see `shortcutsAsText`.
    text: "",
  },
];

/**
 * The shortcut list, derived from the table the application actually uses.
 *
 * Not retyped. Two lists of key bindings drift the first time one of them is
 * changed, and the drift is silent — an assistant confidently naming a key that
 * does nothing is exactly the failure this grounding exists to prevent. `Ctrl`
 * rather than the Mac symbol, matching what the app's own help sheet prints on
 * this machine.
 */
export function shortcutsAsText(): string {
  const groups = new Map<string, string[]>();

  for (const s of SHORTCUTS) {
    const list = groups.get(s.group) ?? [];
    list.push(`- ${s.keys.join(" then ")} — ${s.label}`);
    groups.set(s.group, list);
  }
  for (const s of FOREIGN_SHORTCUTS) {
    const list = groups.get(s.group) ?? [];
    list.push(`- ${s.keys.join(" + ")} — ${s.label}`);
    groups.set(s.group, list);
  }

  const lines: string[] = [];
  for (const [group, items] of groups) {
    lines.push(`${group}:`, ...items, "");
  }
  lines.push(
    "The G shortcuts are a sequence: press G, release it, then the second key.",
    "Press ? to see this list inside the app. None of them fire while you are typing.",
  );
  return lines.join("\n");
}

/** Every concept, rendered. The shortcut entry takes its text from the real table. */
export function conceptsAsText(): string {
  return PRODUCT_CONCEPTS.map((c) =>
    c.id === "shortcuts"
      ? `## ${c.title}\n\n${shortcutsAsText()}`
      : `## ${c.title}\n\n${c.text}`,
  ).join("\n\n");
}

export function conceptIds(): string[] {
  return PRODUCT_CONCEPTS.map((c) => c.id);
}
