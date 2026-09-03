"use client";

import type { Role } from "@prisma/client";
import { Menu } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";

import { AmbientBackdrop } from "@/components/layout/ambient-backdrop";
import { CommandPalette } from "@/components/layout/command-palette";
import { PageAccentScope } from "@/components/layout/page-accent-scope";
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
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);
  const [helpOpen, setHelpOpen] = React.useState(false);

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

      {/* `relative z-10` on the chrome and the content column is what keeps
          them above the decorative layers. Those layers cannot use a negative
          z-index: this wrapper is positioned but does not create a stacking
          context, so a negative index would drop them into the root context
          and paint them *behind* this element's own opaque background. */}
      <aside className="relative z-10 hidden w-64 shrink-0 border-r bg-sidebar/70 backdrop-blur-xl lg:block">
        <Sidebar
          workspace={workspace}
          workspaces={workspaces}
          projects={projects}
          role={role}
          unreadCount={unreadCount}
        />
      </aside>

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
          <div className="relative z-10">{children}</div>
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
