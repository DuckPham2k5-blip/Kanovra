import { Role } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { assignableRoles, can, canManageRole, type Permission } from "./permissions";

/**
 * The permission matrix is the app's security boundary — every server action
 * calls `can()` before it writes. These tests pin the answers down so a future
 * edit to the matrix cannot quietly widen access.
 */

const ALL_ROLES = [Role.OWNER, Role.ADMIN, Role.MEMBER, Role.VIEWER] as const;

describe("can()", () => {
  it("refuses everything when there is no role", () => {
    // A non-member must never pass a check, whatever is being asked.
    for (const permission of ["workspace:view", "task:view", "task:delete"] as Permission[]) {
      expect(can(null, permission)).toBe(false);
      expect(can(undefined, permission)).toBe(false);
    }
  });

  it("keeps viewers strictly read-only", () => {
    expect(can(Role.VIEWER, "workspace:view")).toBe(true);
    expect(can(Role.VIEWER, "project:view")).toBe(true);
    expect(can(Role.VIEWER, "task:view")).toBe(true);

    const writes: Permission[] = [
      "task:create",
      "task:update",
      "task:move",
      "task:delete",
      "comment:create",
      "checklist:manage",
      "project:create",
      "board:manage_columns",
      "workspace:manage_labels",
    ];
    for (const permission of writes) {
      expect(can(Role.VIEWER, permission), `viewer must not ${permission}`).toBe(false);
    }
  });

  it("reserves destructive workspace actions for the owner", () => {
    expect(can(Role.OWNER, "workspace:delete")).toBe(true);
    for (const role of [Role.ADMIN, Role.MEMBER, Role.VIEWER]) {
      expect(can(role, "workspace:delete"), `${role} must not delete a workspace`).toBe(false);
    }
  });

  it("keeps member-level writes away from members' reach only where intended", () => {
    // Members do day-to-day work…
    expect(can(Role.MEMBER, "task:create")).toBe(true);
    expect(can(Role.MEMBER, "task:delete")).toBe(true);
    expect(can(Role.MEMBER, "comment:create")).toBe(true);
    // …but not administration.
    expect(can(Role.MEMBER, "workspace:manage_members")).toBe(false);
    expect(can(Role.MEMBER, "workspace:update")).toBe(false);
    expect(can(Role.MEMBER, "project:archive")).toBe(false);
    expect(can(Role.MEMBER, "project:delete")).toBe(false);
    expect(can(Role.MEMBER, "comment:delete_any")).toBe(false);
  });

  it("never grants a lower role something a higher role lacks", () => {
    const permissions: Permission[] = [
      "workspace:view", "workspace:update", "workspace:delete", "workspace:manage_members",
      "workspace:manage_labels", "project:view", "project:create", "project:update",
      "project:archive", "project:delete", "board:view", "board:manage_columns",
      "task:view", "task:create", "task:update", "task:move", "task:assign",
      "task:delete", "comment:create", "comment:delete_any", "checklist:manage",
    ];
    // Privilege must increase monotonically with rank; this catches a typo in
    // the matrix that would let, say, a member do something an admin cannot.
    const order = [Role.VIEWER, Role.MEMBER, Role.ADMIN, Role.OWNER];
    for (const permission of permissions) {
      for (let i = 1; i < order.length; i++) {
        if (can(order[i - 1], permission)) {
          expect(can(order[i], permission), `${order[i]} < ${order[i - 1]} for ${permission}`).toBe(
            true,
          );
        }
      }
    }
  });
});

describe("canManageRole()", () => {
  it("lets nobody but the owner act on an owner", () => {
    expect(canManageRole(Role.OWNER, Role.OWNER)).toBe(true);
    expect(canManageRole(Role.ADMIN, Role.OWNER)).toBe(false);
    expect(canManageRole(Role.MEMBER, Role.OWNER)).toBe(false);
    expect(canManageRole(Role.VIEWER, Role.OWNER)).toBe(false);
  });

  it("stops an admin from acting on another admin", () => {
    // Equal rank: without this, any admin could demote every other admin.
    expect(canManageRole(Role.ADMIN, Role.ADMIN)).toBe(false);
    expect(canManageRole(Role.ADMIN, Role.MEMBER)).toBe(true);
    expect(canManageRole(Role.ADMIN, Role.VIEWER)).toBe(true);
  });

  it("refuses members and viewers outright", () => {
    for (const target of ALL_ROLES) {
      expect(canManageRole(Role.MEMBER, target)).toBe(false);
      expect(canManageRole(Role.VIEWER, target)).toBe(false);
    }
  });
});

describe("assignableRoles()", () => {
  it("never lets anyone hand out OWNER", () => {
    for (const role of ALL_ROLES) {
      expect(assignableRoles(role)).not.toContain(Role.OWNER);
    }
  });

  it("narrows as rank drops", () => {
    expect(assignableRoles(Role.OWNER)).toEqual([Role.ADMIN, Role.MEMBER, Role.VIEWER]);
    expect(assignableRoles(Role.ADMIN)).toEqual([Role.MEMBER, Role.VIEWER]);
    expect(assignableRoles(Role.MEMBER)).toEqual([]);
    expect(assignableRoles(Role.VIEWER)).toEqual([]);
  });
});
