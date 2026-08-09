import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

import { consumeToken, WRITE_LIMIT } from "@/lib/rate-limit";

/**
 * Everything is private by default. Only the marketing page, the auth screens,
 * the Clerk webhook and the health probe are reachable without a session.
 *
 * `/api/health` has to be public: Docker's HEALTHCHECK, PM2 and the deploy
 * script's readiness gate all call it with no cookies, and `auth.protect()`
 * answers an unauthenticated API request with a 404 — which would leave the
 * container permanently unhealthy. It reports liveness only and exposes no
 * workspace data.
 */
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/invite/(.*)",
  "/api/webhooks/(.*)",
  "/api/health",
]);

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

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return NextResponse.next();

  const { userId } = await auth.protect();

  if (isServerAction(req)) {
    // Keyed by user rather than by IP: a whole office behind one NAT address
    // would otherwise share a single allowance.
    const verdict = consumeToken(`action:${userId}`, WRITE_LIMIT);
    if (!verdict.ok) {
      return NextResponse.json(
        { error: "Too many requests. Please slow down and try again shortly." },
        {
          status: 429,
          headers: {
            "Retry-After": String(verdict.retryAfterSeconds),
            "X-RateLimit-Limit": String(WRITE_LIMIT.limit),
            "X-RateLimit-Remaining": "0",
          },
        },
      );
    }
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
