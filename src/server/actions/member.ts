"use server";

import { InvitationStatus, Role } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { ForbiddenError, getMembership, requireUser } from "@/lib/auth";
import { sendEmail, workspaceInviteEmail } from "@/lib/email";
import { logActivity, notify } from "@/lib/events";
import { can, canManageRole, ROLE_LABEL } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { inviteMemberSchema, updateMemberRoleSchema } from "@/lib/validations";
import { fail, ok, parse, withErrorHandling, type ActionResult } from "@/server/action-result";

const INVITE_TTL_DAYS = 14;

/**
 * Invites someone by email. If they already have an account they are added
 * straight away; otherwise a token-bearing invitation row is created and the
 * caller shows the shareable link.
 */
export async function inviteMember(
  input: unknown,
): Promise<ActionResult<{ added: boolean; inviteUrl?: string }>> {
  // The type argument is explicit: inference would otherwise narrow `added` to
  // the literal `true` from the first `ok(...)` in the body.
  return withErrorHandling<{ added: boolean; inviteUrl?: string }>(async () => {
    const user = await requireUser();
    const data = parse(inviteMemberSchema, input);

    const membership = await getMembership(user.id, data.workspaceId);
    if (!can(membership?.role, "workspace:manage_members")) throw new ForbiddenError();
    if (!canManageRole(membership!.role, data.role)) {
      return fail(`Bạn không thể mời với vai trò ${ROLE_LABEL[data.role]}.`);
    }

    const workspace = await prisma.workspace.findUniqueOrThrow({
      where: { id: data.workspaceId },
      select: { id: true, name: true, slug: true },
    });

    const email = data.email.toLowerCase();
    const existingUser = await prisma.user.findUnique({ where: { email } });

    if (existingUser) {
      const already = await getMembership(existingUser.id, workspace.id);
      if (already) return fail("Người này đã là thành viên.");

      await prisma.workspaceMember.create({
        data: { workspaceId: workspace.id, userId: existingUser.id, role: data.role },
      });

      await Promise.all([
        logActivity({
          workspaceId: workspace.id,
          actorId: user.id,
          type: "MEMBER_JOINED",
          message: `${user.name} đã thêm ${existingUser.name} vào không gian làm việc`,
        }),
        notify({
          userId: existingUser.id,
          workspaceId: workspace.id,
          actorId: user.id,
          type: "MEMBER_JOINED",
          title: `Bạn đã được thêm vào ${workspace.name}`,
          body: `Vai trò: ${ROLE_LABEL[data.role]}`,
          link: `/w/${workspace.slug}`,
        }),
      ]);

      revalidatePath(`/w/${workspace.slug}`, "layout");
      return ok({ added: true });
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);
    const token = randomUUID();

    const invitation = await prisma.invitation.upsert({
      where: { workspaceId_email: { workspaceId: workspace.id, email } },
      update: {
        role: data.role,
        token,
        status: InvitationStatus.PENDING,
        expiresAt,
        invitedById: user.id,
      },
      create: {
        workspaceId: workspace.id,
        email,
        role: data.role,
        token,
        expiresAt,
        invitedById: user.id,
      },
    });

    const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
    const inviteUrl = `${base}/invite/${invitation.token}`;

    // Fire-and-forget — the invitation itself is already persisted, so an
    // email failure must not surface as an action error. The link keeps
    // working as a manual fallback either way.
    void sendEmail({
      to: email,
      subject: `${user.name} đã mời bạn tham gia ${workspace.name} trên TaskForge`,
      html: workspaceInviteEmail({
        workspaceName: workspace.name,
        inviterName: user.name,
        roleLabel: ROLE_LABEL[data.role],
        inviteUrl,
      }),
    });

    revalidatePath(`/w/${workspace.slug}/members`);
    return ok({ added: false, inviteUrl });
  });
}

export async function revokeInvitation(invitationId: string): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { workspace: { select: { slug: true, id: true } } },
    });
    if (!invitation) return fail("Không tìm thấy lời mời.");

    const membership = await getMembership(user.id, invitation.workspace.id);
    if (!can(membership?.role, "workspace:manage_members")) throw new ForbiddenError();

    await prisma.invitation.update({
      where: { id: invitationId },
      data: { status: InvitationStatus.REVOKED },
    });

    revalidatePath(`/w/${invitation.workspace.slug}/members`);
    return ok(undefined);
  });
}

/** Redeems an invitation token for the signed-in user. */
export async function acceptInvitation(token: string): Promise<ActionResult<{ slug: string }>> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const invitation = await prisma.invitation.findUnique({
      where: { token },
      include: { workspace: { select: { id: true, slug: true, name: true } } },
    });

    if (!invitation) return fail("Lời mời không tồn tại.");
    if (invitation.status !== InvitationStatus.PENDING) return fail("Lời mời đã được sử dụng hoặc bị thu hồi.");
    if (invitation.expiresAt < new Date()) {
      await prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: InvitationStatus.EXPIRED },
      });
      return fail("Lời mời đã hết hạn.");
    }

    const existing = await getMembership(user.id, invitation.workspaceId);
    if (!existing) {
      await prisma.workspaceMember.create({
        data: {
          workspaceId: invitation.workspaceId,
          userId: user.id,
          role: invitation.role,
        },
      });
      await logActivity({
        workspaceId: invitation.workspaceId,
        actorId: user.id,
        type: "MEMBER_JOINED",
        message: `${user.name} đã tham gia không gian làm việc`,
      });
    }

    await prisma.invitation.update({
      where: { id: invitation.id },
      data: { status: InvitationStatus.ACCEPTED },
    });

    revalidatePath("/", "layout");
    return ok({ slug: invitation.workspace.slug });
  });
}

export async function updateMemberRole(input: unknown): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const data = parse(updateMemberRoleSchema, input);

    const actor = await getMembership(user.id, data.workspaceId);
    if (!can(actor?.role, "workspace:manage_members")) throw new ForbiddenError();

    const target = await prisma.workspaceMember.findUnique({
      where: { id: data.memberId },
      include: {
        user: { select: { id: true, name: true } },
        workspace: { select: { slug: true, ownerId: true } },
      },
    });
    if (!target || target.workspaceId !== data.workspaceId) return fail("Không tìm thấy thành viên.");
    if (target.userId === user.id) return fail("Bạn không thể tự đổi vai trò của mình.");
    if (!canManageRole(actor!.role, target.role) || !canManageRole(actor!.role, data.role)) {
      return fail("Bạn không đủ quyền thay đổi vai trò này.");
    }
    if (target.workspace.ownerId === target.userId) {
      return fail("Không thể thay đổi vai trò của chủ sở hữu.");
    }

    await prisma.workspaceMember.update({
      where: { id: data.memberId },
      data: { role: data.role },
    });

    await Promise.all([
      logActivity({
        workspaceId: data.workspaceId,
        actorId: user.id,
        type: "MEMBER_ROLE_CHANGED",
        message: `${user.name} đã đổi vai trò của ${target.user.name} thành ${ROLE_LABEL[data.role]}`,
      }),
      notify({
        userId: target.userId,
        workspaceId: data.workspaceId,
        actorId: user.id,
        type: "MEMBER_JOINED",
        title: "Vai trò của bạn đã thay đổi",
        body: `Vai trò mới: ${ROLE_LABEL[data.role]}`,
        link: `/w/${target.workspace.slug}`,
      }),
    ]);

    revalidatePath(`/w/${target.workspace.slug}/members`);
    return ok(undefined);
  });
}

export async function removeMember(memberId: string): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const target = await prisma.workspaceMember.findUnique({
      where: { id: memberId },
      include: {
        user: { select: { id: true, name: true } },
        workspace: { select: { id: true, slug: true, ownerId: true } },
      },
    });
    if (!target) return fail("Không tìm thấy thành viên.");

    const actor = await getMembership(user.id, target.workspace.id);
    if (!can(actor?.role, "workspace:manage_members")) throw new ForbiddenError();
    if (target.workspace.ownerId === target.userId) return fail("Không thể xoá chủ sở hữu.");
    if (!canManageRole(actor!.role, target.role)) return fail("Bạn không đủ quyền xoá thành viên này.");

    await prisma.workspaceMember.delete({ where: { id: memberId } });

    await logActivity({
      workspaceId: target.workspace.id,
      actorId: user.id,
      type: "MEMBER_REMOVED",
      message: `${user.name} đã xoá ${target.user.name} khỏi không gian làm việc`,
    });

    revalidatePath(`/w/${target.workspace.slug}/members`);
    return ok(undefined);
  });
}

/** Transfers ownership; the previous owner becomes an admin. */
export async function transferOwnership(
  workspaceId: string,
  newOwnerUserId: string,
): Promise<ActionResult> {
  return withErrorHandling(async () => {
    const user = await requireUser();
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { ownerId: true, slug: true },
    });
    if (!workspace) return fail("Không tìm thấy không gian làm việc.");
    if (workspace.ownerId !== user.id) return fail("Chỉ chủ sở hữu mới chuyển quyền được.");

    const target = await getMembership(newOwnerUserId, workspaceId);
    if (!target) return fail("Người nhận phải là thành viên của không gian làm việc.");

    await prisma.$transaction([
      prisma.workspace.update({ where: { id: workspaceId }, data: { ownerId: newOwnerUserId } }),
      prisma.workspaceMember.update({ where: { id: target.id }, data: { role: Role.OWNER } }),
      prisma.workspaceMember.updateMany({
        where: { workspaceId, userId: user.id },
        data: { role: Role.ADMIN },
      }),
    ]);

    revalidatePath(`/w/${workspace.slug}`, "layout");
    return ok(undefined);
  });
}
