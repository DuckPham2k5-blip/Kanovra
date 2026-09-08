import { describe, expect, it } from "vitest";

import { publicColumn, publicProject, publicTaskCard } from "@/lib/public-board-dto";
import type { ColumnDTO, TaskCardDTO } from "@/types";

function card(overrides: Partial<TaskCardDTO> = {}): TaskCardDTO {
  return {
    id: "task_1",
    number: 42,
    title: "Ship the thing",
    description: "A description",
    status: "TODO",
    priority: "HIGH",
    order: 1,
    columnId: "col_1",
    parentId: null,
    dueDate: "2026-09-30T00:00:00.000Z",
    startDate: null,
    estimate: 3,
    completedAt: null,
    assignee: {
      id: "user_1",
      name: "Duck Pham",
      email: "phamduck2005@gmail.com",
      imageUrl: null,
    },
    labels: [{ id: "lab_1", name: "bug", color: "#ef4444" }],
    checklistTotal: 3,
    checklistDone: 1,
    subtaskCount: 2,
    commentCount: 4,
    attachmentCount: 0,
    openBlockers: 1,
    recurrence: null,
    ...overrides,
  };
}

describe("publicTaskCard", () => {
  /*
   * The one that matters. Everything else on a card is content somebody chose
   * to publish; an address is content about a person who did not.
   */
  it("drops the assignee's email", () => {
    const out = publicTaskCard(card());
    expect(out.assignee?.name).toBe("Duck Pham");
    expect(out.assignee).not.toHaveProperty("email");
    expect(JSON.stringify(out)).not.toContain("@");
  });

  it("keeps the assignee's id, because the avatar's colour comes from it", () => {
    expect(publicTaskCard(card()).assignee?.id).toBe("user_1");
  });

  it("survives an unassigned card", () => {
    expect(publicTaskCard(card({ assignee: null })).assignee).toBeNull();
  });

  /*
   * The allowlist's real job, stated as a test: a field nobody thought about
   * must not travel. This is what a `delete task.assignee.email` version would
   * fail — it would pass every assertion above and ship this one.
   */
  it("drops a field that was never named", () => {
    const smuggled = {
      ...card(),
      internalNote: "the client is late paying",
      workspaceId: "ws_secret",
    } as TaskCardDTO;

    const out = publicTaskCard(smuggled);
    expect(out).not.toHaveProperty("internalNote");
    expect(out).not.toHaveProperty("workspaceId");
    expect(JSON.stringify(out)).not.toContain("late paying");
  });

  it("drops an unnamed field hidden inside a label", () => {
    const smuggled = card({
      labels: [
        { id: "lab_1", name: "bug", color: "#ef4444", createdBy: "someone@example.com" },
      ] as unknown as TaskCardDTO["labels"],
    });
    expect(JSON.stringify(publicTaskCard(smuggled))).not.toContain("example.com");
  });

  it("passes the fields a board is actually made of straight through", () => {
    const out = publicTaskCard(card());
    expect(out.title).toBe("Ship the thing");
    expect(out.number).toBe(42);
    expect(out.status).toBe("TODO");
    expect(out.priority).toBe("HIGH");
    expect(out.columnId).toBe("col_1");
    expect(out.dueDate).toBe("2026-09-30T00:00:00.000Z");
    expect(out.labels).toEqual([{ id: "lab_1", name: "bug", color: "#ef4444" }]);
    expect(out.checklistDone).toBe(1);
    expect(out.openBlockers).toBe(1);
  });
});

describe("publicColumn", () => {
  it("carries only what draws a column", () => {
    const smuggled = {
      id: "col_1",
      name: "In progress",
      color: "#94a3b8",
      order: 2,
      wipLimit: 5,
      status: "IN_PROGRESS",
      projectId: "proj_secret",
    } as ColumnDTO;

    const out = publicColumn(smuggled);
    expect(out).toEqual({
      id: "col_1",
      name: "In progress",
      color: "#94a3b8",
      order: 2,
      wipLimit: 5,
      status: "IN_PROGRESS",
    });
  });
});

describe("publicProject", () => {
  it("carries the five fields a header draws and nothing about the workspace", () => {
    const out = publicProject({
      name: "Mobile app",
      key: "MOB",
      description: "The rewrite",
      color: "#6366f1",
      icon: "Rocket",
      // Present on the row this is called with, and the reason the function
      // exists rather than the row being spread.
      workspaceId: "ws_secret",
      taskCounter: 91,
    } as Parameters<typeof publicProject>[0]);

    expect(out).toEqual({
      name: "Mobile app",
      key: "MOB",
      description: "The rewrite",
      color: "#6366f1",
      icon: "Rocket",
    });
  });
});
