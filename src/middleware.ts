import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

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

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return NextResponse.next();
  await auth.protect();
  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next internals and static files unless they show up in search params.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
