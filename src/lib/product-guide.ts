/**
 * What this application actually contains, written down.
 *
 * ## Why this file exists rather than a clever prompt
 *
 * An assistant asked "how do I share a board?" will answer either way. Without
 * a description of *this* product it answers from every task manager it has
 * ever read — confidently naming a Share button in the top right, because most
 * of them have one. The person looks, does not find it, and concludes the
 * application is broken. A wrong answer delivered fluently is worse than no
 * assistant, because it costs the reader time *and* their trust in the screen
 * in front of them.
 *
 * So the assistant is grounded in this. Every claim it makes about where a
 * control lives should be traceable to an entry here.
 *
 * ## It is checked for cover, not for contents
 *
 * `product-guide.test.ts` asserts that every route with a `page.tsx` under
 * `src/app/(app)` has an entry and that no entry names a route that does not
 * exist. It cannot check that a description is *true* — nothing can, short of
 * reading it — but it can stop the file quietly falling behind the application,
 * which is the failure that happens on its own. Adding a page now breaks a
 * test rather than silently teaching the assistant to talk about eight pages
 * when there are nine.
 *
 * This is the same shape as `icon-registry.ts`: the test asserts the cover
 * because the cover is what drifts.
 *
 * ## Written for a reader, not for a model
 *
 * Each entry is prose a person could follow. That is deliberate: text that only
 * makes sense as prompt scaffolding cannot be reviewed by whoever changes the
 * page it describes, and an unreviewable description is one that goes stale.
 */

export type GuideControl = {
  /** Exactly what is printed on it, or its accessible name if it has no text. */
  label: string;
  /** What pressing it does, in one plain sentence. */
  does: string;
  /** How to find it, from the page itself. */
  where: string;
  /** Named only when it is not simply "anybody in the workspace". */
  needs?: string;
};

export type GuideEntry = {
  /** Route pattern, exactly as the folder path under `src/app/(app)` reads. */
  route: string;
  /** What the interface calls it. */
  name: string;
  /** The question this page answers. */
  purpose: string;
  controls: GuideControl[];
  /** Things the interface cannot say about itself, and that surprise people. */
  notes?: string[];
};

export const PRODUCT_GUIDE: GuideEntry[] = [
  {
    route: "/w/[slug]",
    name: "Overview",
    purpose:
      "The first screen of a workspace: how much work there is, how much is late, and which projects are live.",
    controls: [
      {
        label: "Total tasks / In progress / Completed / Overdue",
        does: "Four counts across every project in the workspace. They are figures, not links.",
        where: "A row of cards at the top.",
      },
      {
        label: "Project cards",
        does: "Opens that project's board.",
        where: "Below the counts. Empty workspaces show 'No projects yet' instead.",
      },
    ],
    notes: [
      "Overdue counts tasks whose due date is strictly before today, so something due today is not late yet.",
    ],
  },
  {
    route: "/w/[slug]/my-tasks",
    name: "My tasks",
    purpose:
      "Everything assigned to you across every project in the workspace, in one list.",
    controls: [
      {
        label: "Search box, and the status / priority / assignee filters",
        does:
          "Narrows the list. Every filter is written into the address bar, so the narrowed list can be linked, reloaded and reached with the browser's Back button.",
        where: "The toolbar above the list.",
      },
      {
        label: "The chevron beside a task with subtasks",
        does: "Folds its subtasks under it, so a child never sits beside its parent as though it were separate work.",
        where: "At the left of the row.",
      },
      {
        label: "Export",
        does:
          "Downloads the rows you are looking at as a CSV, built in the browser from what is on screen.",
        where: "The toolbar.",
      },
      {
        label: "Saved views",
        does:
          "Stores the current set of filters under a name. Sharing one hands the workspace a set of filters, not access to anything.",
        where: "The toolbar.",
      },
      {
        label: "The checkbox on a row",
        does: "Marks the task done. It is the only checkbox on a row and it never means 'selected'.",
        where: "At the left of each row.",
      },
      {
        label: "Select all, Ctrl-click, Shift-click",
        does: "Chooses rows for a bulk change — status, priority, assignee, or delete.",
        where: "The header checkbox selects all; the two clicks work on rows.",
      },
    ],
    notes: [
      "Subtasks are exported even when their parent is folded shut, so a CSV can hold more rows than the screen shows. That is why the toast names two numbers.",
      "A bulk delete checks permission on each task, so a mixed selection can be partly deletable.",
    ],
  },
  {
    route: "/w/[slug]/projects",
    name: "Projects",
    purpose: "Every project in the workspace, and where new ones are made.",
    controls: [
      {
        label: "New project",
        does:
          "Creates a project. The dialog offers a template, which builds the board's columns and a few labels for you.",
        where: "Top right of the page, and the + beside Projects in the sidebar.",
        needs: "Member or above",
      },
      {
        label: "A project card",
        does: "Opens that project's board.",
        where: "The grid.",
      },
    ],
    notes: [
      "The template picker appears only when creating. A preset cannot restructure a board people are already working on.",
    ],
  },
  {
    route: "/w/[slug]/projects/[projectId]",
    name: "Project",
    purpose:
      "The project's own entry point; it opens on the board. The header above it stays on every project tab.",
    controls: [
      {
        label: "Board / List / Calendar",
        does: "Switches between three views of the same tasks.",
        where: "The project header.",
      },
      {
        label: "Members",
        does: "Adds or removes people on this project.",
        where: "The project header.",
        needs: "Member or above",
      },
      {
        label: "The ⋯ menu",
        does: "Edit, Backdrop, Share board, Archive, and Delete project.",
        where: "Far right of the project header.",
        needs: "Member or above; Share and Delete need Admin",
      },
    ],
  },
  {
    route: "/w/[slug]/projects/[projectId]/board",
    name: "Kanban board",
    purpose: "The project's tasks as cards in columns, moved by dragging.",
    controls: [
      {
        label: "Drag a card",
        does:
          "Moves it between columns and reorders it. A card takes the status of the column it lands in.",
        where: "Anywhere on the card.",
        needs: "Member or above",
      },
      {
        label: "A card",
        does: "Opens the task panel — description, checklist, subtasks, comments, attachments, dependencies and time.",
        where: "Click it. The panel puts ?task=… in the address bar, so it can be linked.",
      },
      {
        label: "The column ⋯ menu",
        does: "Add task, edit the column, or delete it.",
        where: "Right of each column heading.",
        needs: "Member or above",
      },
      {
        label: "Add column",
        does: "Adds a column, with a status and an optional WIP limit.",
        where: "After the last column.",
        needs: "Member or above",
      },
    ],
    notes: [
      "The number beside a column name is its card count; with a WIP limit it reads 3/5 and turns red when over.",
      "Completing a task moves its card to the column whose status is DONE, so a board with no DONE column sends the card nowhere.",
    ],
  },
  {
    route: "/w/[slug]/projects/[projectId]/list",
    name: "Project list",
    purpose: "The same tasks as the board, as rows — better for filtering, bulk edits and export.",
    controls: [
      {
        label: "Filters, saved views, Export, bulk selection",
        does: "The same controls as My tasks, scoped to this project.",
        where: "The toolbar above the list.",
      },
    ],
  },
  {
    route: "/w/[slug]/projects/[projectId]/calendar",
    name: "Project calendar",
    purpose: "This project's tasks by due date.",
    controls: [
      { label: "A day", does: "Shows the tasks due that day.", where: "The grid." },
      { label: "A task", does: "Opens the task panel.", where: "Inside a day." },
    ],
  },
  {
    route: "/w/[slug]/calendar",
    name: "Calendar",
    purpose: "Due dates across every project in the workspace.",
    controls: [
      { label: "A day", does: "Shows the tasks due that day.", where: "The grid." },
    ],
  },
  {
    route: "/w/[slug]/maps",
    name: "Maps",
    purpose:
      "Thinking maps — five kinds of diagram for working an idea out, separate from tasks.",
    controls: [
      {
        label: "New map",
        does: "Creates a map. You choose the kind at that moment and it cannot be changed afterwards.",
        where: "Top right.",
        needs: "Member or above",
      },
      { label: "A map card", does: "Opens the map canvas.", where: "The grid." },
    ],
    notes: [
      "Circle, bubble and tree are free canvases; the rest are laid out from their structure and their nodes cannot be dragged.",
    ],
  },
  {
    route: "/w/[slug]/maps/[mapId]",
    name: "Map canvas",
    purpose: "One map, on an unbounded plane you pan and zoom.",
    controls: [
      {
        label: "Drag the background",
        does: "Pans. The wheel zooms, from very far out to very far in.",
        where: "Anywhere not on a node.",
      },
      {
        label: "The + on a node",
        does: "Adds one child, the same size as its parent.",
        where: "On the selected node.",
        needs: "Member or above",
      },
      {
        label: "The node's corner",
        does:
          "Resizes it — drag the pointer twice as far from the centre and the node is twice the size. There is no button; the resize cursor is the affordance.",
        where: "The bottom-right corner of a node.",
        needs: "Member or above",
      },
      {
        label: "The node ⋯ menu",
        does: "Colour, emoji, make it bigger or smaller, and delete.",
        where: "On the selected node.",
        needs: "Member or above",
      },
      {
        label: "The comment button on a node",
        does: "Opens the discussion for that node. A red mark means comments you have not read.",
        where: "On the selected node.",
      },
      {
        label: "Appearance",
        does:
          "The map's colour and tone, and one of twenty-seven backdrops. The first control there turns the drifting background lights off.",
        where: "The map toolbar.",
      },
    ],
    notes: [
      "Saving is automatic, about a second after you stop. There is no Save button.",
      "If two people edit one map at once, the second save is refused with a banner offering both ways out rather than overwriting silently.",
      "The map surface deliberately ignores the system 'reduce motion' setting; the switch at the top of Appearance is how to stop the movement.",
    ],
  },
  {
    route: "/w/[slug]/analytics",
    name: "Analytics",
    purpose: "Charts of how work is distributed and how fast it is finishing.",
    controls: [
      {
        label: "All projects",
        does: "Narrows every chart to one project.",
        where: "The filter above the charts.",
      },
      {
        label: "Completion rate, and 'From created to done'",
        does: "Read-only figures: the share of tasks finished, and how long they take.",
        where: "The top of the page.",
      },
      {
        label: "Status distribution, Priority distribution, Workload by member, Workload by project, Tasks created and completed",
        does: "Five charts. They are read-only.",
        where: "Down the page.",
      },
    ],
  },
  {
    route: "/w/[slug]/notifications",
    name: "Notifications",
    purpose: "What happened while you were away — assignments, mentions, comments, due dates.",
    controls: [
      { label: "A notification", does: "Opens whatever it refers to.", where: "The list." },
      { label: "Mark all read", does: "Clears the unread count.", where: "Top of the list." },
      {
        label: "The bell in the top bar",
        does: "The same list, without leaving the page. It also holds the mute switch for the notification sound.",
        where: "Top right of every page.",
      },
    ],
  },
  {
    route: "/w/[slug]/members",
    name: "Members",
    purpose: "Who is in the workspace, what they may do, and who has been invited.",
    controls: [
      {
        label: "Invite",
        does: "Sends an invitation by email address, with a role.",
        where: "Top right.",
        needs: "Admin or above",
      },
      {
        label: "The role beside a person",
        does: "Changes what they may do. Owner, Admin, Member, Viewer.",
        where: "Their row.",
        needs: "Admin or above, and nobody may act on an Owner except the Owner",
      },
    ],
    notes: [
      "Viewer is genuinely read-only. Member does day-to-day work. Admin manages projects, people and settings — and is the lowest role that can publish a board publicly.",
    ],
  },
  {
    route: "/w/[slug]/settings",
    name: "Settings",
    purpose: "The workspace's name, description and accent colour, its labels, and the ways to leave or delete it.",
    controls: [
      {
        label: "Workspace name, Description, Accent colour",
        does: "Changes how the workspace appears to everyone in it.",
        where: "The form at the top.",
        needs: "Admin or above",
      },
      {
        label: "Labels",
        does: "Creates, renames and recolours the labels every project shares.",
        where: "Below the form.",
        needs: "Member or above",
      },
      {
        label: "Danger zone — Leave workspace, Delete workspace",
        does: "Leaving removes you. Deleting removes the workspace and everything in it, for everyone.",
        where: "The bottom of the page.",
        needs: "Deleting is the Owner only",
      },
    ],
  },
  {
    route: "/w/[slug]/ai",
    name: "Assistant",
    purpose:
      "A conversation with an AI about this application and about your work — how a page works, what a control does, or thinking a piece of work through.",
    controls: [
      {
        label: "The message box",
        does: "Sends a question. The answer streams back as it is written.",
        where: "The bottom of the conversation.",
      },
      {
        label: "The suggestions",
        does: "Fills the box with a question worth asking, on an empty conversation.",
        where: "The middle of the page, before you have written anything.",
      },
      {
        label: "The conversation list",
        does: "Reopens an earlier conversation, renames it, or deletes it.",
        where: "The left of the page.",
      },
      {
        label: "The model picker",
        does:
          "Chooses which assistant answers. Only providers whose key is configured appear; the rest say what is missing.",
        where: "Above the message box.",
      },
      {
        label: "Thinking",
        does: "Lets the model work the answer out at more length before replying. Slower, better on hard questions.",
        where: "Beside the model picker.",
      },
    ],
    notes: [
      "Conversations are private to you. Nobody else in the workspace can read them, and they are not part of the activity feed.",
      "The assistant is told what this application contains, so it should not invent buttons. If it describes something you cannot find, treat that as a bug worth reporting rather than as your own mistake.",
    ],
  },
];

/**
 * Turns a concrete pathname into the entry that describes it.
 *
 * Segments in brackets match anything; the number of segments has to agree, so
 * `/w/acme/projects` cannot match the board's pattern. Returns undefined rather
 * than a guess: the assistant saying nothing about the current page is better
 * than it describing a different one.
 */
export function guideForPath(pathname: string): GuideEntry | undefined {
  const actual = pathname.split("?")[0].split("/").filter(Boolean);
  return PRODUCT_GUIDE.find((entry) => {
    const pattern = entry.route.split("/").filter(Boolean);
    if (pattern.length !== actual.length) return false;
    return pattern.every((seg, i) => seg.startsWith("[") || seg === actual[i]);
  });
}

/** One entry as plain text, for the model's context. */
export function guideEntryAsText(entry: GuideEntry): string {
  const lines = [`## ${entry.name}  (${entry.route})`, entry.purpose, "", "Controls:"];
  for (const c of entry.controls) {
    lines.push(`- ${c.label} — ${c.does} Where: ${c.where}${c.needs ? ` Needs: ${c.needs}.` : ""}`);
  }
  if (entry.notes?.length) {
    lines.push("", "Worth knowing:");
    for (const n of entry.notes) lines.push(`- ${n}`);
  }
  return lines.join("\n");
}

/**
 * The whole guide as text.
 *
 * Handed to the model once per conversation rather than searched: it is a few
 * thousand tokens, and a retrieval step over fifteen entries would be a moving
 * part that can pick the wrong one — which is exactly the failure this file
 * exists to prevent.
 */
export function guideAsText(): string {
  return PRODUCT_GUIDE.map(guideEntryAsText).join("\n\n");
}
