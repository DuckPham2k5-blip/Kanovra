import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReadOnlyBoard } from "@/components/board/read-only-board";
import { APP_NAME } from "@/lib/constants";
import { resolveNamedIcon } from "@/lib/icon-registry";
import { getPublicBoard } from "@/lib/public-board";
import { Rocket } from "lucide-react";

/**
 * A board, read-only, for somebody with no account.
 *
 * This route is in `middleware.ts`'s public matcher, so nothing here is behind
 * `auth.protect()`. Everything that decides what a visitor may see is in
 * `lib/public-board.ts`; this file draws whatever that returns and calls
 * `notFound()` when it returns nothing.
 *
 * Notably absent, and each on purpose: the workspace shell, the sidebar, the
 * notification bell, presence, the realtime subscription, the command palette
 * and the task detail panel. A visitor gets the board and the project's name.
 * The detail panel is where comments, attachments and time entries live, and
 * each of those is a separate decision about a stranger's access that nobody
 * has made — so the public surface is exactly one query, which is small enough
 * to audit in one sitting.
 */

/**
 * Rendered per request, never from the full route cache.
 *
 * Without this a board could be served from a cached render after its link has
 * been turned off — the page would be correct at the moment it was built and
 * wrong for as long as the entry survives, which is the one failure mode a
 * revoke button must not have.
 */
export const dynamic = "force-dynamic";

/**
 * The root layout says `index: true`. A shared board must say otherwise: the
 * link was given to a person, and a crawler that finds it in a referrer header
 * or a pasted message would otherwise put the workspace's work into a search
 * index, where turning the link off does not take it back out.
 *
 * The title is the app's name rather than the project's. A tab title, a
 * bookmark and a browser history entry all outlive the visit, and the project
 * name is behind the click either way.
 */
export const metadata: Metadata = {
  title: "Shared board",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: { index: false, follow: false },
  },
};

export default async function SharedBoardPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const board = await getPublicBoard(token);

  if (!board) notFound();

  const Icon = resolveNamedIcon(board.project.icon, Rocket);

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background">
      <header className="shrink-0 border-b px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${board.project.color}22`, color: board.project.color }}
          >
            <Icon className="size-5" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-lg font-semibold">{board.project.name}</h1>
              <span className="rounded-full border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
                {board.project.key}
              </span>
              {/* Said plainly and near the title. A board that looks exactly
                  like the real one, with nothing that responds to a click, is
                  otherwise indistinguishable from a broken page. */}
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                Read-only
              </span>
            </div>
            {board.project.description ? (
              <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">
                {board.project.description}
              </p>
            ) : null}
          </div>

          <Link
            href="/"
            className="shrink-0 text-xs text-muted-foreground underline-offset-4 hover:underline"
          >
            {APP_NAME}
          </Link>
        </div>
      </header>

      <div className="min-h-0 flex-1 pt-4">
        <ReadOnlyBoard
          columns={board.columns}
          tasks={board.tasks}
          projectKey={board.project.key}
        />
      </div>

      <footer className="shrink-0 border-t px-4 py-2 text-[11px] text-muted-foreground sm:px-6">
        {board.expiresAt ? (
          <>
            This link stops working on{" "}
            <time dateTime={board.expiresAt}>
              {new Date(board.expiresAt).toLocaleDateString("en-GB", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </time>
            .
          </>
        ) : (
          <>Shared read-only. Anyone with the link can see this board.</>
        )}
      </footer>
    </div>
  );
}
