"use client";

import { usePathname } from "next/navigation";
import * as React from "react";

import { accentForPath } from "@/lib/page-accent";
import { cn } from "@/lib/utils";

/**
 * Publishes the current route's accent colour to everything inside it.
 *
 * The colour lives on one element rather than on the backdrop alone, so the
 * chrome can share it — the wash, the veil under the top bar and the active
 * nav item all read the same `--page-accent` and therefore glide together on
 * a single transition instead of drifting out of step.
 *
 * `--page-accent` is registered as a `<color>` in globals.css, which is what
 * lets it interpolate at all; browsers without `@property` snap to the new
 * colour, which still looks correct.
 */
export function PageAccentScope({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const accent = accentForPath(pathname);

  return (
    <div
      data-accent={accent.name}
      style={{ "--page-accent": accent.color } as React.CSSProperties}
      className={cn("tf-accent-scope", className)}
    >
      {children}
    </div>
  );
}
