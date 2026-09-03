import { Skeleton } from "@/components/ui/skeleton";

/**
 * What every workspace page shows while its server render is in flight.
 *
 * ## Why this file exists at all
 *
 * There was no `loading.tsx` anywhere in the app, and the consequence is not
 * cosmetic. Without one, a route has no Suspense boundary, so Next holds the
 * *old* page on screen until the new one is completely ready — the sidebar link
 * highlights, and then nothing happens for as long as the render takes. On a
 * warm dev server that is around 280ms and reads as a stutter; on a cold route
 * it was measured at 12.7 seconds and reads as a broken application.
 *
 * With a boundary here the shell paints immediately and this fills the content
 * column, so a navigation always looks like it started. The server render takes
 * exactly as long either way — what changes is that the person can see it
 * happening, which is the difference between "slow" and "dead".
 *
 * ## Why one file rather than nine
 *
 * A `loading.tsx` covers every route below it that has none of its own, so this
 * single file serves Overview, My tasks, Projects, Calendar, Maps, Analytics,
 * Notifications, Members and Settings. Nine bespoke skeletons would each be a
 * second copy of a page's layout, and every one of them would drift the first
 * time its page changed — a skeleton that no longer resembles what it precedes
 * is worse than a plain one, because the content visibly jumps when it lands.
 * This shape — a title, a couple of controls, then rows — is what all nine have
 * in common.
 */
export default function Loading() {
  return (
    <div className="space-y-6 p-6" aria-busy>
      {/* The screen reader gets a sentence; the boxes below are decorative and
          are hidden from it, or it reads a dozen empty regions. */}
      <span className="sr-only">Loading…</span>

      <div aria-hidden className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-52" />
          <Skeleton className="h-4 w-72" />
        </div>

        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>

        <div className="space-y-2">
          {/* Fading the rows down the list keeps the block from reading as
              content in its own right. */}
          {[100, 90, 80, 65, 50, 35].map((opacity, i) => (
            <Skeleton
              key={i}
              className="h-14 w-full"
              style={{ opacity: opacity / 100 }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
