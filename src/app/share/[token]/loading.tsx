import { Skeleton } from "@/components/ui/skeleton";

/**
 * The boundary for a shared board.
 *
 * The workspace's own `loading.tsx` sits under `w/[slug]` and does not reach
 * here, so this route would otherwise have no Suspense boundary at all — the
 * standing requirement recorded in CLAUDE.md is that a new route gets one or is
 * covered by one, and this is a new route outside everything that exists.
 *
 * It matters more here than anywhere else in the application. A visitor arrives
 * from a link with no shell already on screen, so without a boundary the browser
 * shows the *previous page* — often a chat window — until the render finishes,
 * and the link looks like it did nothing. Columns rather than rows, because that
 * is the shape of what lands.
 */
export default function Loading() {
  return (
    <div className="flex h-dvh min-h-0 flex-col" aria-busy>
      <span className="sr-only">Loading the board…</span>

      <div aria-hidden className="flex min-h-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b px-4 py-4 sm:px-6">
          <Skeleton className="size-9 rounded-lg" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>

        <div className="flex min-h-0 flex-1 gap-4 px-4 pt-4 sm:px-6">
          {[100, 85, 70, 55].map((opacity, i) => (
            <div
              key={i}
              className="flex w-[19rem] shrink-0 flex-col gap-2 rounded-xl border bg-muted/40 p-2"
              style={{ opacity: opacity / 100 }}
            >
              <Skeleton className="mx-1 h-4 w-28" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
