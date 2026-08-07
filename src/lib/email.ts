import "server-only";

import { Resend } from "resend";

/**
 * Thin wrapper around Resend. Every call is fire-and-forget from the caller's
 * point of view — a failed email must never roll back the underlying action
 * (the invitation/task/etc. it's attached to already succeeded), so errors are
 * logged and swallowed here, matching the pattern used by logActivity/notify.
 */

let client: Resend | null = null;

function getClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new Resend(apiKey);
  return client;
}

const FROM =
  process.env.RESEND_FROM_EMAIL ?? "TaskForge <onboarding@resend.dev>";

export async function sendEmail(input: { to: string; subject: string; html: string }) {
  const resend = getClient();
  if (!resend) {
    // Local dev without a Resend key configured — the invite link still works,
    // it just isn't emailed. Not an error, so log at info level only.
    console.log(`[email] RESEND_API_KEY not set — skipped "${input.subject}" to ${input.to}`);
    return;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: input.to,
      subject: input.subject,
      html: input.html,
    });
    if (error) console.error("[email] Resend rejected the message", error);
  } catch (error) {
    console.error("[email] failed to send", error);
  }
}

/** Shared shell so every transactional email looks like it belongs to the app. */
function emailShell(bodyHtml: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1e1b2e;">
      <div style="display: inline-flex; align-items: center; gap: 8px; margin-bottom: 24px;">
        <div style="width: 28px; height: 28px; border-radius: 8px; background: #6366f1; display: inline-block;"></div>
        <span style="font-size: 18px; font-weight: 700; vertical-align: middle;">TaskForge</span>
      </div>
      ${bodyHtml}
      <p style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #6b7280;">
        Bạn nhận được email này vì có người thao tác trên TaskForge liên quan đến địa chỉ email của bạn.
      </p>
    </div>
  `;
}

export function workspaceInviteEmail(input: {
  workspaceName: string;
  inviterName: string;
  roleLabel: string;
  inviteUrl: string;
}) {
  return emailShell(`
    <h1 style="font-size: 20px; margin: 0 0 12px;">Lời mời tham gia ${input.workspaceName}</h1>
    <p style="font-size: 14px; line-height: 1.6; color: #374151;">
      <strong>${input.inviterName}</strong> đã mời bạn tham gia không gian làm việc
      <strong>${input.workspaceName}</strong> trên TaskForge với vai trò <strong>${input.roleLabel}</strong>.
    </p>
    <a href="${input.inviteUrl}"
       style="display: inline-block; margin-top: 20px; padding: 10px 20px; background: #6366f1; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
      Chấp nhận lời mời
    </a>
    <p style="margin-top: 20px; font-size: 12px; color: #6b7280;">
      Hoặc dán đường dẫn này vào trình duyệt: <br />
      <a href="${input.inviteUrl}" style="color: #6366f1;">${input.inviteUrl}</a>
    </p>
    <p style="margin-top: 12px; font-size: 12px; color: #9ca3af;">Lời mời có hiệu lực trong 14 ngày.</p>
  `);
}
