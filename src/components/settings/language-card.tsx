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
import { DATE_FORMATS, type DateFormatKey } from "@/lib/region";

/**
 * Language & Region. The **date format** here is real — it drives every date
 * the app shows, through the region provider — while language stays English
 * (the app has no other) and timezone shows what the browser resolved. Both are
 * marked plainly rather than dressed up as working controls.
 */
export function LanguageCard() {
  const { dateFormat, setDateFormat } = useRegion();
  const [timeZone, setTimeZone] = React.useState("Auto");

  React.useEffect(() => {
    try {
      setTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone || "Auto");
    } catch {
      // Some environments do not expose it; "Auto" is a fine fallback.
    }
  }, []);

  return (
    <SettingsCard
      id="language"
      icon={Globe}
      title="Language & Region"
      description="Set your language, timezone, and date format."
    >
      <div className="space-y-1">
        {/* Real: applies app-wide. */}
        <SettingRow
          label="Date format"
          description="How dates read across the app."
          control={
            <Select
              value={dateFormat}
              onValueChange={(v) => setDateFormat(v as DateFormatKey)}
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

        {/* Honest: English only for now. */}
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

        {/* Honest: reflects the device; a manual override needs timezone-aware
            formatting everywhere, which is not wired up. */}
        <div className="flex items-center justify-between gap-4 py-2.5">
          <div className="space-y-0.5">
            <div className="text-sm font-medium">Timezone</div>
            <div className="text-xs text-muted-foreground">Dates use your device&apos;s timezone.</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="max-w-[150px] truncate text-sm text-muted-foreground" title={timeZone}>
              {timeZone}
            </span>
            <ComingSoonBadge />
          </div>
        </div>
      </div>

      <div className="mt-3">
        <Label className="text-[11px] text-muted-foreground">
          Preview: {DATE_FORMATS.find((f) => f.key === dateFormat)?.example}
        </Label>
      </div>
    </SettingsCard>
  );
}
