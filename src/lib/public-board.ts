import "server-only";

import { toTaskCardDTO } from "@/lib/dto";
import { logWarn } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import {
  publicColumn,
  publicProject,
  publicTaskCard,
  type PublicBoardDTO,
} from "@/lib/public-board-dto";
import { getBoardData } from "@/lib/queries";
import { isShareTokenShape, shareLinkLive, shouldStampView } from "@/lib/share-link";

/**
 * The only way workspace content reaches somebody with no session.
 *
 * Every other read in this application starts from `requireWorkspace` or
 * `getMembership`. This one starts from a string in the address bar, so the
 * whole of the check lives here and is meant to be read in one sitting:
 *
 *   1. the string is the right shape, or nothing is looked up at all
 *   2. a link with that token exists
 *   3. it has not expired
 *   4. what comes back is narrowed by an allowlist before it leaves the server
 *
 * There is no fifth step and no branch that skips one. A caller cannot ask for
 * "the board behind this token, ignoring expiry" because this module does not
 * offer it.
 */
export async function getPublicBoard(
  token: string,
  now: Date = new Date(),
): Promise<PublicBoardDTO | null> {
  /*
   * The shape check comes first so a crawl costs no queries. A public URL is
   * reachable by everything on the internet, and most of what arrives is a
   * scanner walking a wordlist — `/share/wp-login.php` and its thousand
   * neighbours are answered from a regex.
   */
  if (!isShareTokenShape(token)) return null;

  const link = await prisma.shareLink.findUnique({
    where: { token },
    select: {
      id: true,
      expiresAt: true,
      lastViewedAt: true,
      project: {
        select: {
          id: true,
          name: true,
          key: true,
          description: true,
          color: true,
          icon: true,
        },
      },
    },
  });

  /*
   * One answer for "no such link" and for "expired". A visitor cannot tell
   * which, so a token that has been turned off gives away nothing about
   * whether it was ever real.
   */
  if (!shareLinkLive(link, now)) return null;
  // Narrowed above; restated for the type checker, which cannot see through
  // the helper.
  if (!link) return null;

  /*
   * The same read the members' board makes, through the same mapper. A
   * separate query shaped for the public page is the shape of bug this project
   * has already paid for twice: two implementations of one thing, drifting
   * apart where nobody is looking. The narrowing happens after, as its own
   * step, rather than by writing a second `select` that somebody will later
   * add a field to.
   *
   * An archived project still resolves. Archiving is housekeeping inside the
   * workspace, not a privacy decision, and a link dying because somebody
   * tidied up is a failure nobody would connect to its cause. Turning the link
   * off is the control that means "no longer public", and it is one button.
   */
  const { columns, tasks } = await getBoardData(link.project.id);

  stampView(link.id, link.lastViewedAt, now);

  return {
    project: publicProject(link.project),
    columns: columns.map(publicColumn),
    tasks: tasks.map(toTaskCardDTO).map(publicTaskCard),
    expiresAt: link.expiresAt ? link.expiresAt.toISOString() : null,
  };
}

/**
 * Roughly when this link was last opened.
 *
 * Not awaited. The visitor is waiting for a board and this is a note for its
 * author; a lost stamp costs at most an hour of precision on a field whose
 * whole question is "is anybody still using this". Rejections are caught here
 * because an unhandled one takes the worker down — which would make a
 * bookkeeping write the most dangerous thing on the page.
 */
function stampView(id: string, lastViewedAt: Date | null, now: Date) {
  if (!shouldStampView(lastViewedAt, now)) return;
  void prisma.shareLink
    .update({ where: { id }, data: { lastViewedAt: now } })
    .catch((error: unknown) => {
      logWarn("share-link.stamp", "could not record a view", {
        id,
        message: error instanceof Error ? error.message : String(error),
      });
    });
}

/** The link on a project, for the dialog that manages it. Members only — the caller checks. */
export async function getShareLink(projectId: string) {
  return prisma.shareLink.findUnique({
    where: { projectId },
    select: {
      token: true,
      createdAt: true,
      expiresAt: true,
      lastViewedAt: true,
      createdBy: { select: { id: true, name: true, imageUrl: true } },
    },
  });
}
