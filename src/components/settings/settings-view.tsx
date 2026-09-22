"use client";

import {
  BarChart3,
  Bell,
  Blocks,
  CreditCard,
  Database,
  Paintbrush,
  Shield,
  Sparkles,
  User,
} from "lucide-react";
import * as React from "react";

import { AiCard } from "@/components/settings/ai-card";
import { AppearanceCard } from "@/components/settings/appearance-card";
import { ProfileCard } from "@/components/settings/profile-card";
import {
  AccountOverviewCard,
  BillingCard,
  DataPrivacyCard,
  IntegrationsCard,
  LanguageCard,
  NotificationsCard,
  SecurityCard,
} from "@/components/settings/static-cards";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export type SettingsOverview = {
  plan: string;
  memberSince: string;
  workspaces: number;
  projects: number;
  tasks: number;
};

const RAIL = [
  { id: "account", label: "Account", icon: User },
  { id: "appearance", label: "Appearance", icon: Paintbrush },
  { id: "ai", label: "AI Assistant", icon: Sparkles },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "integrations", label: "Integrations", icon: Blocks },
  { id: "security", label: "Security", icon: Shield },
  { id: "privacy", label: "Data & Privacy", icon: Database },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "overview", label: "Overview", icon: BarChart3 },
];

export function SettingsView({
  overview,
  aiModels,
  workspaceSlot,
  organizationSlot,
}: {
  overview: SettingsOverview;
  aiModels: { id: string; label: string }[];
  workspaceSlot: React.ReactNode;
  organizationSlot: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <Tabs defaultValue="personal">
        <TabsList className="mb-6">
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="workspace">Workspace</TabsTrigger>
          <TabsTrigger value="organization">Organization</TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="focus-visible:outline-none">
          <div className="flex gap-6">
            {/* Section rail — sticky anchors that light up the section in view. */}
            <SectionRail />

            {/* Cards. Profile spans the full width; the rest flow in a masonry
                so tall and short cards pack without leaving gaps. */}
            <div className="min-w-0 flex-1 space-y-4">
              <ProfileCard />
              <div
                className="lg:columns-2 [&>*]:mb-4 [&>*]:break-inside-avoid"
                style={{ columnGap: "1rem" }}
              >
                <AppearanceCard />
                <AiCard models={aiModels} />
                <AccountOverviewCard {...overview} />
                <NotificationsCard />
                <LanguageCard />
                <SecurityCard />
                <DataPrivacyCard />
                <IntegrationsCard />
                <BillingCard plan={overview.plan} />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="workspace" className="focus-visible:outline-none">
          {workspaceSlot}
        </TabsContent>

        <TabsContent value="organization" className="focus-visible:outline-none">
          {organizationSlot}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * The left rail, which highlights whichever section is currently near the top
 * of the viewport. It lives inside the Personal tab so its observer attaches
 * when that tab mounts and detaches when Radix unmounts the inactive tab —
 * there is nothing to observe on the other two tabs.
 */
function SectionRail() {
  const [active, setActive] = React.useState(RAIL[0]?.id ?? "");

  React.useEffect(() => {
    const ids = RAIL.map((r) => r.id);
    const els = ids
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el != null);
    if (els.length === 0) return;

    const inView = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inView.add(entry.target.id);
          else inView.delete(entry.target.id);
        }
        // The first section in rail order that is currently in view wins, so
        // the highlight moves down the list as the page scrolls.
        const next = ids.find((id) => inView.has(id));
        if (next) setActive(next);
      },
      // Discount the sticky top and the lower half of the screen, so a section
      // counts as "active" only once it reaches the upper reading area.
      { rootMargin: "-96px 0px -55% 0px", threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="sticky top-20 hidden h-fit w-48 shrink-0 space-y-1 lg:block">
      {RAIL.map(({ id, label, icon: Icon }) => {
        const current = active === id;
        return (
          <a
            key={id}
            href={`#${id}`}
            aria-current={current ? "true" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
              current
                ? "bg-primary/10 font-medium text-primary"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </a>
        );
      })}
    </nav>
  );
}
