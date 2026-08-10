/**
 * Whether an invitation may be redeemed by the person currently signed in.
 *
 * An invitation is addressed to one mailbox, and holding the link is not the
 * same as being that mailbox: invitation mail gets forwarded, and links get
 * pasted into group chats. Without this check, whoever opens the link first
 * joins the workspace at whatever role was offered — so a forwarded ADMIN
 * invitation hands admin to a stranger.
 *
 * Comparison is case-insensitive and trimmed, which is how mail addresses
 * behave in practice, and strict about everything else. In particular a plus
 * alias is *not* accepted as the invited address: `a+x@host` and `a@host` reach
 * the same inbox at most providers, but treating them as equal would let one
 * mailbox claim invitations addressed to another wherever that is not true.
 *
 * Kept here rather than inline in the action so the rule can be tested without
 * a database or a session, the same way the permission matrix is.
 */
export function invitationIsFor(
  invitationEmail: string | null | undefined,
  userEmail: string | null | undefined,
): boolean {
  const invited = normalise(invitationEmail);
  const holder = normalise(userEmail);

  // Two blanks are not a match. An invitation with no address is broken data,
  // and answering "yes" to it would open the workspace to anyone.
  if (!invited || !holder) return false;

  return invited === holder;
}

function normalise(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}
