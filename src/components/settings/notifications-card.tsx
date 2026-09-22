"use client";

import { Bell } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { SettingRow, SettingsCard } from "@/components/settings/settings-ui";
import { Switch } from "@/components/ui/switch";
import {
  NOTIFICATION_CATEGORIES,
  type NotificationCategory,
} from "@/lib/notification-prefs";
import { setNotificationPreference } from "@/server/actions/notification-prefs";

/**
 * The real notification preferences. Each switch gates whether that category of
 * notification is created for this person at all — the check runs server-side
 * in `events.ts`, so turning one off genuinely stops the notification, not just
 * its display. The toggle is optimistic and reverts if the server refuses.
 */
export function NotificationsCard({
  initial,
}: {
  initial: Record<NotificationCategory, boolean>;
}) {
  const [prefs, setPrefs] = React.useState(initial);
  const [pending, setPending] = React.useState<NotificationCategory | null>(null);

  async function toggle(category: NotificationCategory, enabled: boolean) {
    const previous = prefs[category];
    setPrefs((p) => ({ ...p, [category]: enabled }));
    setPending(category);
    const result = await setNotificationPreference({ category, enabled });
    setPending(null);
    if (!result.success) {
      setPrefs((p) => ({ ...p, [category]: previous }));
      toast.error(result.error);
    }
  }

  return (
    <SettingsCard
      id="notifications"
      icon={Bell}
      title="Notifications"
      description="Choose what you want to be notified about."
    >
      <div className="divide-y">
        {NOTIFICATION_CATEGORIES.map((cat) => (
          <SettingRow
            key={cat.key}
            label={cat.label}
            description={cat.description}
            control={
              <Switch
                checked={prefs[cat.key]}
                disabled={pending === cat.key}
                onCheckedChange={(v) => toggle(cat.key, v)}
                aria-label={cat.label}
              />
            }
          />
        ))}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Applies to in-app notifications (the bell in the top bar). Email and browser delivery are
        on the way.
      </p>
    </SettingsCard>
  );
}
