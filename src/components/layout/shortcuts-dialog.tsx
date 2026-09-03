"use client";

import * as React from "react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FOREIGN_SHORTCUTS, SHORTCUTS } from "@/lib/shortcuts";

/**
 * The sheet `?` opens.
 *
 * It reads the same table the handler reads, so a shortcut cannot work without
 * appearing here — and it also lists the ones belonging to the canvas and the
 * task list, which this component does not implement. Leaving those out would
 * make the sheet wrong by omission: somebody would read it and conclude Ctrl+Z
 * does nothing on a map.
 */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const groups = React.useMemo(() => {
    const rows = [
      ...SHORTCUTS.map((s) => ({ keys: s.keys, label: s.label, group: s.group })),
      ...FOREIGN_SHORTCUTS,
    ];
    const out = new Map<string, { keys: string[]; label: string }[]>();
    for (const row of rows) {
      const list = out.get(row.group);
      if (list) list.push(row);
      else out.set(row.group, [row]);
    }
    return [...out.entries()];
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press <Keys keys={["G"]} /> then a letter to move around. Shortcuts are ignored
            while you are typing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {groups.map(([group, rows]) => (
            <section key={group} className="space-y-1.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group}
              </p>
              <ul className="divide-y rounded-lg border">
                {rows.map((row) => (
                  <li
                    key={`${group}-${row.label}`}
                    className="flex items-center justify-between gap-4 px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{row.label}</span>
                    <Keys keys={row.keys} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** One box per key, matching the `Ctrl K` chip already in the top bar. */
function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      {keys.map((key, i) => (
        <React.Fragment key={`${key}-${i}`}>
          <kbd className="rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] leading-4">
            {key}
          </kbd>
        </React.Fragment>
      ))}
    </span>
  );
}
