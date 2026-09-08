import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { consumeToken, PUBLIC_READ_LIMIT, WRITE_LIMIT, type RateLimitResult } from "@/lib/rate-limit";

/**
 * Everything is private by default. Only the marketing page, the auth screens,
 * the Clerk webhook, the health probe and a published board are reachable
 * without a session.
 *
 * `/api/health` has to be public: Docker's HEALTHCHECK, PM2 and the deploy
 * script's readiness gate all call it with no cookies, and `auth.protect()`
 * answers an unauthenticated API request with a 404 — which would leave the
 * container permanently unhealthy. It reports liveness only and exposes no
 * workspace data.
 *
 * `/share/(.*)` is the one entry here that serves workspace content. What it
 * will serve is decided entirely by `lib/public-board.ts`, from a token; this
 * matcher only says that no session is required to ask.
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/invite/(.*)",
  "/api/webhooks/(.*)",
  "/api/health",
  "/share/(.*)",
]);

const isShareRoute = createRouteMatcher(["/share/(.*)"]);

/**
 * Server Actions are POSTs to the page's own URL, not to `/api/`, so the
 * Nginx rate limit on that prefix never saw them — every write path in the app
 * was uncapped. They are identifiable by the `Next-Action` header, which makes
 * middleware the one place that can cover all of them at once; the alternative
 * was a guard in 26 action bodies, and missing one leaves a hole.
 */
function isServerAction(req: NextRequest) {
  return req.method === "POST" && req.headers.has("next-action");
}

/**
 * Who to charge a request to, when there is no signed-in user to charge it to.
 *
 * `X-Forwarded-For` is a list, oldest first, and only the entries added by our
 * own proxy can be trusted — anything before them was written by the client.
 * The first entry is what Nginx received as the peer address, which is the
 * closest thing to a caller this application gets. Absent any proxy it is
 * missing entirely and every anonymous caller shares one bucket; see the note
 * on `PUBLIC_READ_LIMIT`.
 */
function anonymousKey(req: NextRequest) {
  const forwarded = req.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || req.headers.get("x-real-ip")?.trim() || "unknown";
}

function tooMany(verdict: RateLimitResult, limit: number) {
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(verdict.retryAfterSeconds),
        "X-RateLimit-Limit": String(limit),
        "X-RateLimit-Remaining": "0",
      },
    },
  );
}

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) {
    /*
     * A public *page* must not become a public *action endpoint*.
     *
     * Next dispatches a Server Action by the `Next-Action` header, not by the
     * path it was posted to — any URL will do. So the moment a route stops
     * calling `auth.protect()`, it is also a URL where an action POST skips
     * the write limit below, and the whole cap becomes one line of JavaScript
     * to step around. Each action still calls `requireUser()` itself, so this
     * is not an authentication hole; it is a rate-limiting one, which is
     * exactly the sort that is noticed only once somebody is using it.
     *
     * Charged per address rather than per user, because on a public route
     * there may not be one.
     */
    if (isServerAction(req)) {
      const verdict = consumeToken(`action:anon:${anonymousKey(req)}`, WRITE_LIMIT);
      if (!verdict.ok) return tooMany(verdict, WRITE_LIMIT.limit);
    } else if (isShareRoute(req)) {
      const verdict = consumeToken(`share:${anonymousKey(req)}`, PUBLIC_READ_LIMIT);
      if (!verdict.ok) return tooMany(verdict, PUBLIC_READ_LIMIT.limit);
    }
    return NextResponse.next();
  }

  const { userId } = await auth.protect();

  if (isServerAction(req)) {
    // Keyed by user rather than by IP: a whole office behind one NAT address
    // would otherwise share a single allowance.
    const verdict = consumeToken(`action:${userId}`, WRITE_LIMIT);
    if (!verdict.ok) return tooMany(verdict, WRITE_LIMIT.limit);
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next internals and static files unless they show up in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
