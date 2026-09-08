import Link from "next/link";

import { Button } from "@/components/ui/button";
import { APP_NAME } from "@/lib/constants";

/**
 * What a dead share link looks like.
 *
 * One page for every reason a token does not resolve: never existed, mistyped,
 * expired, turned off. The wording says only that the link does not work,
 * because saying *which* would tell whoever is holding it something about a
 * workspace they have no relationship with — that a board was there and is not
 * any more is information, and an expired link is often in the hands of someone
 * whose access was deliberately ended.
 *
 * It suggests asking the person who sent it rather than signing in. Whoever
 * lands here has no account by assumption, and an invitation to sign in is a
 * dead end that reads like the application blaming them.
 */
export default function ShareNotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">This link doesn&apos;t work</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        It may have been turned off, or it may have expired. Ask whoever sent it to you for a
        new one.
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href="/">Go to {APP_NAME}</Link>
      </Button>
    </div>
  );
}
