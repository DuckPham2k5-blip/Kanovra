"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  daysInMonth,
  pickableParts,
  pickerYears,
  withPart,
  type CalendarView,
  type DatePart,
} from "@/lib/calendar-view";
import { format } from "@/lib/date";
import { cn } from "@/lib/utils";

/**
 * Jump the calendar to an exact day/month/year, from the sketch the owner drew.
 *
 * The stepper walks one unit at a time; this is for "March 2027" in one move,
 * which is what following work across a long stretch needs. Clicking the period
 * opens a panel of tabs — one per part the current view reads (see
 * `pickableParts`) — and a tab reveals a scrolling column of its values.
 * Double-clicking a tab turns that column into a box you type into, which is
 * how the year reaches somewhere a scroll never would.
 *
 * Every choice writes the anchor through `onPick` and the page refetches; the
 * arithmetic (clamping the 31st into February, the year span) is in
 * `calendar-view.ts` with tests, so this file is only the surface.
 */
export function CalendarDatePicker({
  view,
  anchor,
  onPick,
}: {
  view: CalendarView;
  anchor: Date;
  onPick: (date: Date) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const parts = pickableParts(view);
  const [active, setActive] = React.useState<DatePart>(parts[0]);
  const [typing, setTyping] = React.useState(false);

  // The panel is scoped to the view, and switching view can drop the active
  // tab (Day disappears in month view). Fall back to the first available one.
  React.useEffect(() => {
    if (!parts.includes(active)) setActive(parts[0]);
  }, [parts, active]);

  const label =
    view === "day"
      ? format(anchor, "EEEE, d MMMM yyyy")
      : view === "month"
        ? format(anchor, "MMMM yyyy")
        : format(anchor, "yyyy");

  function choose(part: DatePart, value: number) {
    onPick(withPart(anchor, part, value));
    setOpen(false);
    setTyping(false);
  }

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setTyping(false);
        if (v) setActive(parts[0]);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" className="h-auto gap-1.5 px-2 py-1 text-lg font-semibold capitalize">
          {label}
          <ChevronDown className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-64 p-0">
        {/* Tabs: one per part this view reads. Click selects, double-click types. */}
        <div className="flex border-b" role="tablist" aria-label="Pick a date part">
          {parts.map((part) => (
            <button
              key={part}
              role="tab"
              aria-selected={part === active}
              onClick={() => {
                setActive(part);
                setTyping(false);
              }}
              onDoubleClick={() => {
                setActive(part);
                setTyping(true);
              }}
              className={cn(
                "flex-1 px-3 py-2 text-sm capitalize transition-colors",
                part === active
                  ? "border-b-2 border-primary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/60",
              )}
              title="Double-click to type"
            >
              {PART_LABELS[part]}
            </button>
          ))}
        </div>

        {typing ? (
          <TypeBox part={active} anchor={anchor} onApply={(v) => choose(active, v)} />
        ) : (
          <ValueColumn part={active} anchor={anchor} onChoose={(v) => choose(active, v)} />
        )}
      </PopoverContent>
    </Popover>
  );
}

const PART_LABELS: Record<DatePart, string> = { day: "Day", month: "Month", year: "Year" };

/** The scrolling list of numbers for the active part, current value centred. */
function ValueColumn({
  part,
  anchor,
  onChoose,
}: {
  part: DatePart;
  anchor: Date;
  onChoose: (value: number) => void;
}) {
  const year = anchor.getFullYear();
  const values = React.useMemo(() => {
    if (part === "year") return pickerYears(year);
    if (part === "month") return Array.from({ length: 12 }, (_, i) => i); // 0-based
    return Array.from({ length: daysInMonth(year, anchor.getMonth()) }, (_, i) => i + 1);
  }, [part, year, anchor]);

  const current = part === "year" ? year : part === "month" ? anchor.getMonth() : anchor.getDate();

  // Bring the current value into view when the column opens.
  const activeRef = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center" });
  }, [part]);

  return (
    <ScrollArea className="h-56">
      <div className="p-1">
        {values.map((value) => {
          const selected = value === current;
          return (
            <button
              key={value}
              ref={selected ? activeRef : undefined}
              onClick={() => onChoose(value)}
              className={cn(
                "block w-full rounded-md px-3 py-1.5 text-center text-sm tabular-nums transition-colors",
                selected
                  ? "bg-primary font-medium text-primary-foreground"
                  : "hover:bg-accent/60",
              )}
            >
              {part === "month"
                ? format(new Date(2000, value, 1), "MMMM")
                : String(value).padStart(2, "0")}
            </button>
          );
        })}
      </div>
    </ScrollArea>
  );
}

/** Type a value directly — the double-click path, and the only way to a far year. */
function TypeBox({
  part,
  anchor,
  onApply,
}: {
  part: DatePart;
  anchor: Date;
  onApply: (value: number) => void;
}) {
  const currentDisplay =
    part === "year"
      ? anchor.getFullYear()
      : part === "month"
        ? anchor.getMonth() + 1 // shown 1-based, stored 0-based
        : anchor.getDate();
  const [text, setText] = React.useState(String(currentDisplay));

  const bounds =
    part === "year"
      ? { min: 1, max: 9999 }
      : part === "month"
        ? { min: 1, max: 12 }
        : { min: 1, max: daysInMonth(anchor.getFullYear(), anchor.getMonth()) };

  function apply() {
    const n = Number(text);
    if (!Number.isInteger(n) || n < bounds.min || n > bounds.max) return;
    // Month is shown 1-based and stored 0-based; day and year pass straight
    // through.
    onApply(part === "month" ? n - 1 : n);
  }

  return (
    <form
      className="space-y-2 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <label className="text-xs text-muted-foreground">
        Type a {PART_LABELS[part].toLowerCase()} ({bounds.min}–{bounds.max})
      </label>
      <Input
        autoFocus
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))}
        className="h-9"
      />
      <Button type="submit" size="sm" className="w-full">
        Go
      </Button>
    </form>
  );
}
