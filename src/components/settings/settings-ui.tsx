import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Shared furniture for the settings cards, so every card on the page carries
 * the same icon-titled header and the same row rhythm rather than each one
 * inventing its own.
 */

export function SettingsCard({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  icon: LucideIcon;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <Card id={id} className={cn("scroll-mt-24 overflow-hidden", className)}>
      <div className="flex items-start justify-between gap-3 border-b p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-[18px]" />
          </div>
          <div className="space-y-0.5">
            <h3 className="text-sm font-semibold leading-tight">{title}</h3>
            {description ? (
              <p className="text-xs text-muted-foreground">{description}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <CardContent className="p-4 sm:p-5">{children}</CardContent>
    </Card>
  );
}

/** A labelled row with its control pushed to the right — the spine of every
 *  card in the panel. */
export function SettingRow({
  label,
  description,
  control,
  className,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  control: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-4 py-2.5", className)}>
      <div className="min-w-0 space-y-0.5">
        <div className="text-sm font-medium">{label}</div>
        {description ? (
          <div className="text-xs text-muted-foreground">{description}</div>
        ) : null}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/** The honest marker on a card whose backend does not exist yet. */
export function ComingSoonBadge({ className }: { className?: string }) {
  return (
    <Badge variant="secondary" className={cn("gap-1 text-[11px] font-normal", className)}>
      Sắp có
    </Badge>
  );
}
