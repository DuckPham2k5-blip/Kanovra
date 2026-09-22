"use client";

import type { Role } from "@prisma/client";
import { Menu } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { AmbientBackdrop } from "@/components/layout/ambient-backdrop";
import { CommandPalette } from "@/components/layout/command-palette";
import { PageAccentScope } from "@/components/layout/page-accent-scope";
import { EdgeToggle } from "@/components/layout/edge-toggle";
import { PageGlyph } from "@/components/layout/page-glyph";
import { RealtimeSync } from "@/components/layout/realtime-sync";
import { ShortcutsDialog } from "@/components/layout/shortcuts-dialog";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  isTypingTarget,
  resolveShortcut,
  shortcutHref,
  type PrefixState,
} from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

export type ShellUser = {
  id: string;
  name: string;
  email: string;
  imageUrl: string | null;
};

export type ShellWorkspace = {
  id: string;
  name: string;
  slug: string;
  color: string;
};

export type ShellProject = {
  id: string;
  name: string;
  key: string;
  color: string;
  icon: string;
};

/**
 * Two-column application frame: a persistent sidebar on desktop, a slide-over
 * on mobile, plus the top bar and the ⌘K palette. Everything below it is a
 * server component rendered into `children`.
 */
export function AppShell({
  user,
  workspace,
  workspaces,
  projects,
  role,
  unreadCount,
  children,
}: {
  user: ShellUser;
  workspace: ShellWorkspace;
  workspaces: (ShellWorkspace & { role: Role })[];
  projects: ShellProject[];
  role: Role;
  unreadCount: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  /*
   * Inside a single map (`…/maps/<id>`) the workspace sidebar is hidden. The map
   * renders as its own full-bleed surface; the sidebar's `backdrop-blur` — a
   * filter — makes it a containing block for that surface's `position: fixed`,
   * so the overlay stops at the content area and the rail stays visible unless
   * it is removed here. The maps *list* (`…/maps`) keeps its sidebar.
   */
  const onMapDetail = /\/maps\/[^/]+/.test(pathname);

  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);

  /*
   * Whether the desktop sidebar is collapsed to icons. Kept in `localStorage`
   * so the choice sticks across every page and every visit — the owner asked
   * for one toggle that applies everywhere, and the sidebar lives in this shell,
   * which every page renders inside. Read after mount so the server and the
   * first client render agree (both start expanded) and there is no mismatch.
   */
  const [collapsed, setCollapsed] = React.useState(false);
  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("tf-sidebar-collapsed") === "1");
    } catch {
      // Private mode or blocked storage: stay expanded.
    }
  }, []);
  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem("tf-sidebar-collapsed", next ? "1" : "0");
      } catch {
        // Not persisting is fine; the toggle still works for this session.
      }
      return next;
    });
  }, []);

  /*
   * A ref, not state: an armed prefix is not something the page draws, and
   * holding it in state would re-render the whole shell on the way to a key
   * press that may turn out to mean nothing.
   */
  const prefix = React.useRef<PrefixState>(null);

  // Every global shortcut. The table and the matching rule are in
  // `lib/shortcuts.ts`; this is the part that touches the browser.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const outcome = resolveShortcut(event, prefix.current, Date.now());
      if (outcome.kind === "ignore") return;

      /*
       * The typing guard sits here rather than inside the resolver, and applies
       * only to presses without a modifier.
       *
       * ⌘K has always closed the palette from inside the palette's own search
       * box — that is how people dismiss it. Putting this check one step
       * earlier, over every outcome, would have taken that away silently, and
       * nothing would have failed.
       */
      if (!event.metaKey && !event.ctrlKey && isTypingTarget(event.target)) {
        prefix.current = null;
        return;
      }

      if (outcome.kind === "prefix") {
        event.preventDefault();
        prefix.current = { key: outcome.key, at: Date.now() };
        return;
      }

      prefix.current = null;
      // A spent prefix and nothing to run: let the key through untouched.
      if (outcome.kind === "clear") return;

      // `/` opens Firefox's quick-find and `?` its own search; both have to be
      // taken before they reach the browser.
      event.preventDefault();

      if (outcome.id === "palette") setPaletteOpen((open) => !open);
      else if (outcome.id === "help") setHelpOpen(true);
      else {
        const href = shortcutHref(outcome.id, workspace.slug);
        if (href) router.push(href);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, workspace.slug]);

  return (
    <PageAccentScope className="relative flex h-dvh overflow-hidden bg-background">
      <AmbientBackdrop />
      <RealtimeSync workspaceSlug={workspace.slug} />

      {/* `relative z-20` on the chrome and the content column is what keeps
          them above the decorative layers. Those layers cannot use a negative
          z-index: this wrapper is positioned but does not create a stacking
          context, so a negative index would drop them into the root context
          and paint them *behind* this element's own opaque background. The
          sidebar sits a step above the content column (z-20 vs z-10) so its
          edge handle, which straddles the border into the content area, is not
          painted over. */}
      {onMapDetail ? null : (
        <aside
          className={cn(
            "relative z-20 hidden shrink-0 border-r bg-sidebar/70 backdrop-blur-xl transition-[width] duration-200 lg:block",
            collapsed ? "w-16" : "w-64",
          )}
        >
          <Sidebar
            workspace={workspace}
            workspaces={workspaces}
            projects={projects}
            role={role}
            unreadCount={unreadCount}
            collapsed={collapsed}
          />

          {/* The collapse handle — a bordered button that straddles the
              sidebar's right edge rather than living inside its header, so it
              reads as a control *on the seam* between the rail and the page. */}
          <EdgeToggle
            side="left"
            collapsed={collapsed}
            onToggle={toggleCollapsed}
            label={collapsed ? "Expand menu" : "Collapse menu"}
          />
        </aside>
      )}

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 bg-sidebar p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <Sidebar
            workspace={workspace}
            workspaces={workspaces}
            projects={projects}
            role={role}
            unreadCount={unreadCount}
            onNavigate={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Topbar
          user={user}
          workspace={workspace}
          unreadCount={unreadCount}
          onOpenPalette={() => setPaletteOpen(true)}
          menuButton={
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu />
            </Button>
          }
        />
        <main className="relative min-h-0 flex-1 overflow-y-auto">
          {/* The veil gives the accent a hard edge under the top bar; the glyph
              names the section. Both sit at z-0 and the page's own content is
              lifted to z-10 over them. */}
          <div className="tf-accent-veil" />
          <PageGlyph />
          {/* `h-full` so a page can fill the viewport: `main` is a flex child
              with a real height, but this wrapper was auto-height, which
              collapsed any child's `h-full` (the assistant's right column came
              out short, its edge toggle stuck to the top). Taller pages still
              overflow and scroll through `main`. */}
          <div className="relative z-10 h-full">{children}</div>
        </main>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        workspaceSlug={workspace.slug}
        projects={projects}
        onShowShortcuts={() => setHelpOpen(true)}
      />

      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </PageAccentScope>
  );
}
