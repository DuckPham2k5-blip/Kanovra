import { Role } from "@prisma/client";

/**
 * Role hierarchy. Higher number = more privilege. Every permission check is
 * expressed as "does this role rank at or above the minimum required role",
 * which keeps the matrix below readable and impossible to get subtly wrong.
 */
export const ROLE_RANK: Record<Role, number> = {
  OWNER: 40,
  ADMIN: 30,
  MEMBER: 20,
  VIEWER: 10,
};

export type Permission =
  // Workspace
  | "workspace:view"
  | "workspace:update"
  | "workspace:delete"
  | "workspace:manage_members"
  | "workspace:manage_labels"
  // Project
  | "project:view"
  | "project:create"
  | "project:update"
  | "project:archive"
  | "project:delete"
  // Board
  | "board:view"
  | "board:manage_columns"
  // Task
  | "task:view"
  | "task:create"
  | "task:update"
  | "task:move"
  | "task:assign"
  | "task:delete"
  // Collaboration
  | "comment:create"
  | "comment:delete_any"
  | "checklist:manage";

const MINIMUM_ROLE: Record<Permission, Role> = {
  "workspace:view": Role.VIEWER,
  "workspace:update": Role.ADMIN,
  "workspace:delete": Role.OWNER,
  "workspace:manage_members": Role.ADMIN,
  "workspace:manage_labels": Role.MEMBER,

  "project:view": Role.VIEWER,
  "project:create": Role.MEMBER,
  "project:update": Role.MEMBER,
  "project:archive": Role.ADMIN,
  "project:delete": Role.ADMIN,

  "board:view": Role.VIEWER,
  "board:manage_columns": Role.MEMBER,

  "task:view": Role.VIEWER,
  "task:create": Role.MEMBER,
  "task:update": Role.MEMBER,
  "task:move": Role.MEMBER,
  "task:assign": Role.MEMBER,
  "task:delete": Role.MEMBER,

  "comment:create": Role.MEMBER,
  "comment:delete_any": Role.ADMIN,
  "checklist:manage": Role.MEMBER,
};

/** True when `role` is allowed to perform `permission`. */
export function can(role: Role | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[MINIMUM_ROLE[permission]];
}

/** True when `actor` may change another member's role to/from `target`. */
export function canManageRole(actor: Role, target: Role): boolean {
  if (!can(actor, "workspace:manage_members")) return false;
  // Nobody except the owner touches an owner, and admins cannot promote to owner.
  if (target === Role.OWNER) return actor === Role.OWNER;
  return ROLE_RANK[actor] > ROLE_RANK[target] || actor === Role.OWNER;
}

/** Roles an actor is allowed to assign. */
export function assignableRoles(actor: Role): Role[] {
  if (actor === Role.OWNER) return [Role.ADMIN, Role.MEMBER, Role.VIEWER];
  if (actor === Role.ADMIN) return [Role.MEMBER, Role.VIEWER];
  return [];
}

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  VIEWER: "Viewer",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  OWNER: "Full control, including deleting the workspace and transferring ownership.",
  ADMIN: "Manage projects, members and workspace settings.",
  MEMBER: "Create and edit projects, tasks and comments.",
  VIEWER: "Read-only access — cannot make changes.",
};
