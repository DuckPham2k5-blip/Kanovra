"use client";

import type { Role } from "@prisma/client";
import { Menu } from "lucide-react";
import * as React from "react";

import { AmbientBackdrop } from "@/components/layout/ambient-backdrop";
import { CommandPalette } from "@/components/layout/command-palette";
import { PageAccentScope } from "@/components/layout/page-accent-scope";
import { PageGlyph } from "@/components/layout/page-glyph";
import { RealtimeSync } from "@/components/layout/realtime-sync";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

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
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  // Global ⌘K / Ctrl+K.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // `event.key` is occasionally undefined for synthetic/IME-composed
      // events (some browser extensions, autofill) — guard before calling
      // string methods on it.
      if (event.key?.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <PageAccentScope className="relative flex h-dvh overflow-hidden bg-background">
      <AmbientBackdrop />
      <RealtimeSync workspaceSlug={workspace.slug} currentUserId={user.id} />

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
      />
    </PageAccentScope>
  );
}
