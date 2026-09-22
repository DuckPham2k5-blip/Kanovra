import {
  BarChart3,
  Blocks,
  CreditCard,
  Database,
  Download,
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

export function DataPrivacyCard({ exportHref }: { exportHref: string }) {
  return (
    <SettingsCard
      id="privacy"
      icon={Database}
      title="Data & Privacy"
      description="Manage your data and privacy."
    >
      <ul className="divide-y">
        <li className="flex items-center justify-between gap-4 py-2.5 text-sm">
          <div>
            <div>Download workspace data</div>
            <div className="text-[11px] text-muted-foreground">
              Projects, board structure and every task, as JSON.
            </div>
          </div>
          <Button variant="outline" size="sm" asChild>
            <a href={exportHref} download>
              <Download className="size-4" />
              Download
            </a>
          </Button>
        </li>
        <li className="flex items-center justify-between py-2.5 text-sm">
          <span>Export my tasks (CSV)</span>
          <span className="text-[11px] text-muted-foreground">From any task list toolbar</span>
        </li>
        {["AI data usage", "Activity visibility"].map((label) => (
          <li key={label} className="flex items-center justify-between py-2.5 text-sm">
            <span>{label}</span>
            <ComingSoonBadge />
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
