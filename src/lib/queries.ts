import "server-only";

import { Priority, TaskStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Read-side helpers shared by the dashboard, analytics and calendar pages.
 * Everything here is workspace-scoped; callers must have already asserted
 * membership via `requireWorkspace`.
 */

const ACTIVE_STATUSES: TaskStatus[] = [
  TaskStatus.BACKLOG,
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.IN_REVIEW,
];

export type TaskCardData = Awaited<ReturnType<typeof getBoardData>>["tasks"][number];

/** Columns + cards for the Kanban board of a single project. */
export async function getBoardData(projectId: string) {
  const [columns, tasks] = await Promise.all([
    prisma.boardColumn.findMany({
      where: { projectId },
      orderBy: { order: "asc" },
    }),
    prisma.task.findMany({
      where: { projectId, parentId: null },
      orderBy: { order: "asc" },
      include: {
        assignee: { select: { id: true, name: true, imageUrl: true, email: true } },
        labels: { include: { label: true } },
        _count: { select: { subtasks: true, comments: true, attachments: true } },
        checklistItems: { select: { done: true } },
        // The blocker's *status*, not a count: the card shows how many are still
        // in the way, and "in the way" is a question about the other task's
        // state that a `_count` cannot answer.
        blockedBy: { select: { blockingTask: { select: { status: true } } } },
      },
    }),
  ]);

  return { columns, tasks };
}

/** Full task payload for the detail panel. */
export async function getTaskDetail(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      project: { select: { id: true, name: true, key: true, color: true, workspaceId: true } },
      column: true,
      assignee: { select: { id: true, name: true, imageUrl: true, email: true } },
      createdBy: { select: { id: true, name: true, imageUrl: true, email: true } },
      parent: { select: { id: true, title: true, number: true } },
      labels: { include: { label: true } },
      checklistItems: { orderBy: { order: "asc" } },
      subtasks: {
        orderBy: { order: "asc" },
        include: {
          assignee: { select: { id: true, name: true, imageUrl: true } },
        },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true, imageUrl: true } } },
      },
      attachments: { orderBy: { createdAt: "desc" } },
      // Both directions, with enough of the other task to draw a row somebody can
      // recognise and click. Oldest first, so the order does not shuffle when a
      // blocker is finished.
      blockedBy: {
        orderBy: { createdAt: "asc" },
        select: {
          blockingTask: { select: { id: true, number: true, title: true, status: true } },
        },
      },
      blocks: {
        orderBy: { createdAt: "asc" },
        select: {
          blockedTask: { select: { id: true, number: true, title: true, status: true } },
        },
      },
      /*
       * Newest first, and a running entry is newest by definition — it started
       * most recently of anything still open. Ordering by `startedAt` rather
       * than `createdAt` because a manual entry is written now for work that
       * ended now, and reading the list by when the work happened is the only
       * order that makes sense to the person who did it.
       */
      timeEntries: {
        orderBy: { startedAt: "desc" },
        include: {
          user: { select: { id: true, name: true, email: true, imageUrl: true } },
        },
      },
    },
  });
}

/**
 * The saved views on one list.
 *
 * `projectId` null asks for the workspace-wide list, which is "My tasks" — the
 * two never mix, because a project's filters mean nothing on a page showing
 * every project.
 *
 * Shared ones and your own, and nothing else. A private view is private: it is
 * somebody's working shortlist, not content, and there is no page that shows
 * other people's.
 */
export async function getSavedViews(
  workspaceId: string,
  projectId: string | null,
  userId: string,
) {
  return prisma.savedView.findMany({
    where: { workspaceId, projectId, OR: [{ shared: true }, { createdById: userId }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, query: true, shared: true, createdById: true },
  });
}

/** Members of a workspace, shaped for assignee pickers and avatar stacks. */
export async function getWorkspaceMembers(workspaceId: string) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: {
      user: { select: { id: true, name: true, email: true, imageUrl: true } },
    },
    orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
  });
  return members.map((m) => ({ ...m.user, role: m.role, memberId: m.id, joinedAt: m.joinedAt }));
}

/** Headline numbers for the workspace dashboard. */
export async function getWorkspaceStats(workspaceId: string, userId: string) {
  const now = new Date();
  const in48h = new Date(now.getTime() + 48 * 3600 * 1000);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);

  const where = { project: { workspaceId } };

  const [total, done, inProgress, overdue, dueSoon, mine, completedThisWeek, projects, members] =
    await Promise.all([
      prisma.task.count({ where }),
      prisma.task.count({ where: { ...where, status: TaskStatus.DONE } }),
      prisma.task.count({ where: { ...where, status: TaskStatus.IN_PROGRESS } }),
      prisma.task.count({
        where: { ...where, dueDate: { lt: now }, status: { in: ACTIVE_STATUSES } },
      }),
      prisma.task.count({
        where: {
          ...where,
          dueDate: { gte: now, lte: in48h },
          status: { in: ACTIVE_STATUSES },
        },
      }),
      prisma.task.count({
        where: { ...where, assigneeId: userId, status: { in: ACTIVE_STATUSES } },
      }),
      prisma.task.count({
        where: { ...where, status: TaskStatus.DONE, completedAt: { gte: weekAgo } },
      }),
      prisma.project.count({ where: { workspaceId, archived: false } }),
      prisma.workspaceMember.count({ where: { workspaceId } }),
    ]);

  return {
    total,
    done,
    inProgress,
    overdue,
    dueSoon,
    mine,
    completedThisWeek,
    projects,
    members,
    completionRate: total ? Math.round((done / total) * 100) : 0,
  };
}

/** Per-project roll-up used by the dashboard grid and the projects page. */
export async function getProjectSummaries(workspaceId: string) {
  const projects = await prisma.project.findMany({
    where: { workspaceId },
    orderBy: [{ archived: "asc" }, { updatedAt: "desc" }],
    include: {
      _count: { select: { tasks: true, members: true } },
      members: {
        take: 5,
        include: { user: { select: { id: true, name: true, imageUrl: true } } },
      },
    },
  });

  const doneCounts = await prisma.task.groupBy({
    by: ["projectId"],
    where: { projectId: { in: projects.map((p) => p.id) }, status: TaskStatus.DONE },
    _count: { _all: true },
  });
  const doneByProject = new Map(doneCounts.map((d) => [d.projectId, d._count._all]));

  const overdueCounts = await prisma.task.groupBy({
    by: ["projectId"],
    where: {
      projectId: { in: projects.map((p) => p.id) },
      dueDate: { lt: new Date() },
      status: { in: ACTIVE_STATUSES },
    },
    _count: { _all: true },
  });
  const overdueByProject = new Map(overdueCounts.map((d) => [d.projectId, d._count._all]));

  return projects.map((p) => {
    const done = doneByProject.get(p.id) ?? 0;
    return {
      ...p,
      doneCount: done,
      overdueCount: overdueByProject.get(p.id) ?? 0,
      progress: p._count.tasks ? Math.round((done / p._count.tasks) * 100) : 0,
    };
  });
}

/** Tasks assigned to a user across the whole workspace. */
export async function getMyTasks(workspaceId: string, userId: string) {
  return prisma.task.findMany({
    where: { assigneeId: userId, project: { workspaceId } },
    orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { priority: "desc" }],
    include: {
      project: { select: { id: true, name: true, key: true, color: true, icon: true } },
      // What a subtask belongs to. Assignment rarely follows the tree — you are
      // given a step, not the thing containing it — so on this page a subtask
      // almost always arrives without its parent, and a step called "— bước 2"
      // with nothing above it says nothing about what it is part of.
      parent: { select: { id: true, title: true } },
      labels: { include: { label: true } },
      checklistItems: { select: { done: true } },
      _count: { select: { subtasks: true, comments: true } },
      blockedBy: { select: { blockingTask: { select: { status: true } } } },
    },
  });
}

/**
 * The subtasks of a project, for the list view to fold under their parents.
 *
 * A separate query rather than a nested include on `getBoardData`, because the
 * board shares that one and a Kanban column shows top-level cards only — it
 * would carry the extra rows across the wire and then ignore them.
 */
export async function getProjectSubtasks(projectId: string) {
  return prisma.task.findMany({
    where: { projectId, parentId: { not: null } },
    orderBy: { order: "asc" },
    include: {
      assignee: { select: { id: true, name: true, imageUrl: true, email: true } },
      labels: { include: { label: true } },
      _count: { select: { subtasks: true, comments: true, attachments: true } },
      checklistItems: { select: { done: true } },
      blockedBy: { select: { blockingTask: { select: { status: true } } } },
    },
  });
}

/** Every task with a due date inside a range — the calendar view. */
export async function getTasksInRange(
  workspaceId: string,
  from: Date,
  to: Date,
  filters: { projectId?: string; assigneeId?: string } = {},
) {
  return prisma.task.findMany({
    where: {
      project: { workspaceId, ...(filters.projectId ? { id: filters.projectId } : {}) },
      ...(filters.assigneeId ? { assigneeId: filters.assigneeId } : {}),
      dueDate: { gte: from, lte: to },
    },
    orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    include: {
      project: { select: { id: true, name: true, key: true, color: true } },
      assignee: { select: { id: true, name: true, imageUrl: true } },
    },
  });
}

/** Recent workspace activity, newest first. */
export async function getRecentActivity(workspaceId: string, take = 20) {
  return prisma.activity.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      actor: { select: { id: true, name: true, imageUrl: true } },
      project: { select: { id: true, name: true, key: true, color: true } },
      task: { select: { id: true, title: true, number: true } },
    },
  });
}

/**
 * Analytics aggregate for a workspace over the last `days` days.
 * Returns everything the charts need in one round trip.
 */
export async function getAnalytics(workspaceId: string, days = 30, projectId?: string) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - (days - 1));

  const projectFilter = projectId ? { id: projectId } : {};
  const where = { project: { workspaceId, ...projectFilter } };

  const [byStatus, byPriority, byAssignee, byProject, created, completed, tasksForCycle] =
    await Promise.all([
      prisma.task.groupBy({ by: ["status"], where, _count: { _all: true } }),
      prisma.task.groupBy({ by: ["priority"], where, _count: { _all: true } }),
      prisma.task.groupBy({
        by: ["assigneeId"],
        where: { ...where, assigneeId: { not: null } },
        _count: { _all: true },
      }),
      prisma.task.groupBy({ by: ["projectId"], where, _count: { _all: true } }),
      prisma.task.findMany({
        where: { ...where, createdAt: { gte: since } },
        select: { createdAt: true },
      }),
      prisma.task.findMany({
        where: { ...where, completedAt: { gte: since } },
        select: { completedAt: true },
      }),
      prisma.task.findMany({
        where: { ...where, status: TaskStatus.DONE, completedAt: { gte: since } },
        select: { createdAt: true, completedAt: true },
      }),
    ]);

  // Per-assignee breakdown needs names; resolve them in one query.
  const assigneeIds = byAssignee.map((a) => a.assigneeId!).filter(Boolean);
  const [users, doneByAssignee, projects] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: assigneeIds } },
      select: { id: true, name: true, imageUrl: true },
    }),
    prisma.task.groupBy({
      by: ["assigneeId"],
      where: { ...where, assigneeId: { in: assigneeIds }, status: TaskStatus.DONE },
      _count: { _all: true },
    }),
    prisma.project.findMany({
      where: { workspaceId, ...projectFilter },
      select: { id: true, name: true, key: true, color: true },
    }),
  ]);

  const userById = new Map(users.map((u) => [u.id, u]));
  const doneCountByAssignee = new Map(doneByAssignee.map((d) => [d.assigneeId!, d._count._all]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const cycleTimes = tasksForCycle
    .filter((t) => t.completedAt)
    .map((t) => (t.completedAt!.getTime() - t.createdAt.getTime()) / 86_400_000);
  const avgCycleTime = cycleTimes.length
    ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length
    : 0;

  return {
    since,
    days,
    statusCounts: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])) as Record<
      TaskStatus,
      number
    >,
    priorityCounts: Object.fromEntries(
      byPriority.map((p) => [p.priority, p._count._all]),
    ) as Record<Priority, number>,
    workload: byAssignee
      .map((a) => ({
        userId: a.assigneeId!,
        name: userById.get(a.assigneeId!)?.name ?? "Unknown",
        imageUrl: userById.get(a.assigneeId!)?.imageUrl ?? null,
        total: a._count._all,
        done: doneCountByAssignee.get(a.assigneeId!) ?? 0,
      }))
      .sort((a, b) => b.total - a.total),
    byProject: byProject
      .map((p) => ({
        projectId: p.projectId,
        name: projectById.get(p.projectId)?.name ?? "—",
        color: projectById.get(p.projectId)?.color ?? "#6366f1",
        total: p._count._all,
      }))
      .sort((a, b) => b.total - a.total),
    createdDates: created.map((c) => c.createdAt),
    completedDates: completed.map((c) => c.completedAt!).filter(Boolean),
    avgCycleTime,
  };
}

/** Unread notification count for the topbar bell. */
export async function getUnreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, read: false } });
}

export async function getNotifications(userId: string, take = 30) {
  return prisma.notification.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take,
    include: {
      actor: { select: { id: true, name: true, imageUrl: true } },
      workspace: { select: { slug: true, name: true } },
    },
  });
}

/** Powers the ⌘K palette: projects + tasks matching a query. */
export async function searchWorkspace(workspaceId: string, query: string) {
  const q = query.trim();
  if (q.length < 1) return { projects: [], tasks: [] };

  const [projects, tasks] = await Promise.all([
    prisma.project.findMany({
      where: { workspaceId, name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true, key: true, color: true, icon: true },
      take: 5,
    }),
    prisma.task.findMany({
      where: {
        project: { workspaceId },
        OR: [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        title: true,
        number: true,
        status: true,
        priority: true,
        project: { select: { id: true, key: true, color: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 12,
    }),
  ]);

  return { projects, tasks };
}
