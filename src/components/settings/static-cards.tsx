import {
  Bell,
  BarChart3,
  Blocks,
  CreditCard,
  Database,
  Globe,
  Shield,
} from "lucide-react";

import { SettingsCard, ComingSoonBadge } from "@/components/settings/settings-ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

/**
 * The cards that are display-only or not yet backed. They render exactly like
 * the wired cards but say so plainly — a control that does nothing when pressed
 * teaches people the whole panel is decorative, which is the failure the rest
 * of this project is built to avoid. Where a real system already owns the
 * feature (Clerk for security), the card links out to it instead of faking it.
 */

export function AccountOverviewCard({
  plan,
  memberSince,
  workspaces,
  projects,
  tasks,
}: {
  plan: string;
  memberSince: string;
  workspaces: number;
  projects: number;
  tasks: number;
}) {
  const rows: [string, React.ReactNode][] = [
    ["Plan", <Badge key="plan" variant="secondary">{plan}</Badge>],
    ["Member since", memberSince],
    ["Workspaces", workspaces],
    ["Projects", projects],
    ["Tasks", tasks],
  ];
  return (
    <SettingsCard
      id="overview"
      icon={BarChart3}
      title="Account Overview"
      description="Your account details and usage."
    >
      <dl className="divide-y">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
    </SettingsCard>
  );
}

const NOTIFICATION_TYPES = [
  "Task assignments",
  "Task updates",
  "Task due dates",
  "Mentions & comments",
  "Project updates",
  "AI notifications",
];

export function NotificationsCard() {
  return (
    <SettingsCard
      id="notifications"
      icon={Bell}
      title="Notifications"
      description="Choose what you want to be notified about."
      action={<ComingSoonBadge />}
    >
      <p className="mb-3 text-xs text-muted-foreground">
        In-app notifications are on today (the bell in the top bar). Per-type controls and
        email/browser delivery are on the way.
      </p>
      <ul className="divide-y">
        {NOTIFICATION_TYPES.map((label) => (
          <li key={label} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <Badge variant="outline" className="text-[11px] font-normal">
              In-app
            </Badge>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}

export function LanguageCard() {
  return (
    <SettingsCard
      id="language"
      icon={Globe}
      title="Language & Region"
      description="Set your language, timezone, and date format."
      action={<ComingSoonBadge />}
    >
      <dl className="divide-y">
        {[
          ["Language", "English"],
          ["Timezone", "Auto (from your device)"],
          ["Date format", "DD/MM/YYYY"],
        ].map(([label, value]) => (
          <div key={label} className="flex items-center justify-between py-2.5 text-sm">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] text-muted-foreground">
        The interface is English throughout for now; localization is planned.
      </p>
    </SettingsCard>
  );
}

export function SecurityCard() {
  return (
    <SettingsCard
      id="security"
      icon={Shield}
      title="Security"
      description="Keep your account secure."
    >
      <p className="mb-3 text-xs text-muted-foreground">
        Sign-in, password, two-factor and active sessions are handled by Clerk, your account
        provider. Manage them from the <span className="font-medium text-foreground">avatar menu</span>{" "}
        in the top bar → Manage account.
      </p>
      <ul className="divide-y">
        {["Change password", "Two-factor authentication", "Active sessions", "Connected devices"].map(
          (label) => (
            <li key={label} className="flex items-center justify-between py-2.5 text-sm">
              <span className="text-muted-foreground">{label}</span>
              <span className="text-[11px] text-muted-foreground">via Clerk</span>
            </li>
          ),
        )}
      </ul>
    </SettingsCard>
  );
}

export function DataPrivacyCard() {
  const rows: { label: string; note: string; soon?: boolean }[] = [
    { label: "Export my tasks (CSV)", note: "From any task list toolbar" },
    { label: "Download workspace data", note: "Sắp có", soon: true },
    { label: "AI data usage", note: "Sắp có", soon: true },
    { label: "Activity visibility", note: "Sắp có", soon: true },
  ];
  return (
    <SettingsCard
      id="privacy"
      icon={Database}
      title="Data & Privacy"
      description="Manage your data and privacy."
    >
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.label} className="flex items-center justify-between py-2.5 text-sm">
            <span>{row.label}</span>
            {row.soon ? (
              <ComingSoonBadge />
            ) : (
              <span className="text-[11px] text-muted-foreground">{row.note}</span>
            )}
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}

const INTEGRATIONS = [
  "Google Calendar",
  "Google Drive",
  "Slack",
  "GitHub",
  "Notion",
];

export function IntegrationsCard() {
  return (
    <SettingsCard
      id="integrations"
      icon={Blocks}
      title="Integrations"
      description="Connect with your favorite tools."
      action={<ComingSoonBadge />}
    >
      <ul className="divide-y">
        {INTEGRATIONS.map((label) => (
          <li key={label} className="flex items-center justify-between py-2.5 text-sm">
            <span>{label}</span>
            <Button variant="outline" size="sm" disabled>
              Connect
            </Button>
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}

export function BillingCard({ plan }: { plan: string }) {
  return (
    <SettingsCard
      id="billing"
      icon={CreditCard}
      title="Billing"
      description="Manage your plan and payments."
      action={<ComingSoonBadge />}
    >
      <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
        <div>
          <div className="text-xs text-muted-foreground">Current plan</div>
          <div className="text-lg font-semibold">{plan}</div>
        </div>
        <Button size="sm" disabled>
          Upgrade
        </Button>
      </div>
      <ul className="mt-3 divide-y">
        {["Payment method", "Invoices", "Manage subscription"].map((label) => (
          <li key={label} className="flex items-center justify-between py-2.5 text-sm">
            <span className="text-muted-foreground">{label}</span>
            <ComingSoonBadge />
          </li>
        ))}
      </ul>
    </SettingsCard>
  );
}
