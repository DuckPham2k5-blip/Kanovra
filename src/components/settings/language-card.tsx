"use client";

import { Globe } from "lucide-react";
import * as React from "react";

import { useRegion } from "@/components/settings/region-provider";
import { SettingRow, SettingsCard, ComingSoonBadge } from "@/components/settings/settings-ui";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DATE_FORMATS, TIME_ZONES, type DateFormatKey } from "@/lib/region";

/**
 * Language & Region. Date format and timezone are both real — they drive every
 * date the app shows, through the region provider — while language stays
 * English (the app has no other) and is marked plainly rather than dressed up
 * as a working control.
 */
export function LanguageCard() {
  const { region, setRegion, formatDateTime } = useRegion();

  // A live example so the two controls are visibly connected: the current
  // moment, rendered in the chosen format and zone.
  const [now, setNow] = React.useState<Date | null>(null);
  React.useEffect(() => setNow(new Date()), [region]);

  return (
    <SettingsCard
      id="language"
      icon={Globe}
      title="Language & Region"
      description="Set your language, timezone, and date format."
    >
      <div className="space-y-1">
        <SettingRow
          label="Date format"
          description="How dates read across the app."
          control={
            <Select
              value={region.dateFormat}
              onValueChange={(v) => setRegion({ dateFormat: v as DateFormatKey })}
            >
              <SelectTrigger className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DATE_FORMATS.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label} · {f.example}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        <SettingRow
          label="Timezone"
          description="The zone dates and times are shown in."
          control={
            <Select
              value={region.timeZone}
              onValueChange={(v) => setRegion({ timeZone: v })}
            >
              <SelectTrigger className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {TIME_ZONES.map((z) => (
                  <SelectItem key={z.value} value={z.value}>
                    {z.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          }
        />

        <SettingRow
          label={
            <span className="flex items-center gap-2">
              Language <ComingSoonBadge />
            </span>
          }
          description="The interface is English throughout."
          control={
            <Select value="en" disabled>
              <SelectTrigger className="w-[190px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
              </SelectContent>
            </Select>
          }
        />
      </div>

      <div className="mt-3">
        <Label className="text-[11px] text-muted-foreground">
          Now: {now ? formatDateTime(now) : "…"}
        </Label>
      </div>
    </SettingsCard>
  );
}
