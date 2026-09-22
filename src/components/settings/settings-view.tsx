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
            {/* Section rail — sticky anchors, like the mockup's left column. */}
            <nav className="sticky top-20 hidden h-fit w-48 shrink-0 space-y-1 lg:block">
              {RAIL.map(({ id, label, icon: Icon }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <Icon className="size-4" />
                  {label}
                </a>
              ))}
            </nav>

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
