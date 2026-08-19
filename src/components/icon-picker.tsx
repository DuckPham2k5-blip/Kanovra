"use client";

import { Rocket } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { PROJECT_ICONS } from "@/lib/constants";
import { resolveNamedIcon } from "@/lib/icon-registry";
import { cn } from "@/lib/utils";

/**
 * Resolves a lucide icon by name with a safe fallback, so a stale icon string
 * in the database can never crash a render.
 */
export function resolveIcon(name: string | null | undefined): LucideIcon {
  return resolveNamedIcon(name, Rocket);
}

export function ProjectIcon({
  name,
  className,
  color,
}: {
  name: string | null | undefined;
  className?: string;
  color?: string;
}) {
  const Icon = resolveIcon(name);
  return <Icon className={cn("size-4", className)} style={color ? { color } : undefined} />;
}

export function IconPicker({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (icon: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-6 gap-2", className)}>
      {PROJECT_ICONS.map((name) => {
        const Icon = resolveIcon(name);
        const active = value === name;
        return (
          <button
            key={name}
            type="button"
            onClick={() => onChange(name)}
            aria-label={name}
            aria-pressed={active}
            className={cn(
              "flex size-9 items-center justify-center rounded-lg border transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active && "border-primary bg-primary/10 text-primary",
            )}
          >
            <Icon className="size-4" />
          </button>
        );
      })}
    </div>
  );
}
