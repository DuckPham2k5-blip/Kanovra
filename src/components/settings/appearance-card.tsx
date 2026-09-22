"use client";

import { Check, Monitor, Moon, Paintbrush, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import * as React from "react";

import {
  ACCENT_SWATCHES,
  BACKGROUND_OPTIONS,
  usePreferences,
} from "@/components/settings/use-preferences";
import { SettingRow, SettingsCard } from "@/components/settings/settings-ui";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function AppearanceCard() {
  const { theme, setTheme } = useTheme();
  const { prefs, setPref } = usePreferences();
  const [mounted, setMounted] = React.useState(false);

  // The resolved theme is client-only; render a neutral state until mount so
  // the server and first client markup match (same trick as ThemeToggle).
  React.useEffect(() => setMounted(true), []);

  return (
    <SettingsCard
      id="appearance"
      icon={Paintbrush}
      title="Appearance"
      description="Customize the look and feel of Kanovra."
    >
      <div className="space-y-6">
        {/* Theme */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Theme</div>
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map(({ value, label, icon: Icon }) => {
              const active = mounted && theme === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTheme(value)}
                  aria-pressed={active}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-lg border p-3 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <Icon className="size-5" />
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Accent colour */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Accent color</div>
          <div className="flex flex-wrap gap-2.5">
            {ACCENT_SWATCHES.map((swatch) => {
              const active = prefs.accent === swatch.key;
              return (
                <button
                  key={swatch.key}
                  type="button"
                  title={swatch.label}
                  aria-label={swatch.label}
                  aria-pressed={active}
                  onClick={() => setPref("accent", swatch.key)}
                  style={{ background: swatch.preview }}
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-transform hover:scale-110",
                    active && "ring-2 ring-foreground",
                  )}
                >
                  {active ? <Check className="size-3.5 text-white drop-shadow" /> : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Background style */}
        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">Background style</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {BACKGROUND_OPTIONS.map((option) => {
              const active = prefs.background === option.key;
              return (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setPref("background", option.key)}
                  aria-pressed={active}
                  className={cn(
                    "space-y-1.5 rounded-lg border p-1.5 text-center text-[11px] font-medium transition-colors",
                    active ? "border-primary" : "border-border hover:bg-muted/50",
                  )}
                >
                  <BackgroundThumb kind={option.key} />
                  <span className={active ? "text-foreground" : "text-muted-foreground"}>
                    {option.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="divide-y">
          <SettingRow
            label="Reduce motion"
            description="Minimize animations across the app."
            control={
              <Switch
                checked={prefs.reduceMotion}
                onCheckedChange={(v) => setPref("reduceMotion", v)}
                aria-label="Reduce motion"
              />
            }
          />
          <SettingRow
            label="Show background effects"
            description="The ambient wash behind every page."
            control={
              <Switch
                checked={prefs.backgroundEffects}
                onCheckedChange={(v) => setPref("backgroundEffects", v)}
                aria-label="Show background effects"
              />
            }
          />
          <SettingRow
            label="Compact mode"
            description="More content, less spacing."
            control={
              <Switch
                checked={prefs.compact}
                onCheckedChange={(v) => setPref("compact", v)}
                aria-label="Compact mode"
              />
            }
          />
        </div>
      </div>
    </SettingsCard>
  );
}

/** A tiny illustrative swatch for each background preset. Decorative only. */
function BackgroundThumb({ kind }: { kind: string }) {
  const base = "h-9 w-full overflow-hidden rounded-md border bg-muted/40";
  switch (kind) {
    case "aurora":
      return (
        <div
          className={base}
          style={{
            background:
              "radial-gradient(120% 80% at 50% 0%, hsl(var(--primary) / 0.55), transparent 70%)",
          }}
        />
      );
    case "grid":
      return (
        <div
          className={base}
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--primary) / 0.4) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary) / 0.4) 1px, transparent 1px)",
            backgroundSize: "8px 8px",
          }}
        />
      );
    case "dots":
      return (
        <div
          className={base}
          style={{
            backgroundImage: "radial-gradient(hsl(var(--primary) / 0.6) 1px, transparent 1.5px)",
            backgroundSize: "9px 9px",
          }}
        />
      );
    case "minimal":
      return <div className={base} />;
    case "constellation":
      return (
        <div className={cn(base, "relative")}>
          <span className="absolute left-1/2 top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary" />
          <span className="absolute left-2 top-2 size-0.5 rounded-full bg-primary/70" />
          <span className="absolute right-2 top-3 size-0.5 rounded-full bg-primary/70" />
          <span className="absolute bottom-2 left-3 size-0.5 rounded-full bg-primary/70" />
        </div>
      );
    default:
      return <div className={base} />;
  }
}
