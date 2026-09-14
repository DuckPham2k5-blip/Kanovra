"use client";

import { MindMapType } from "@prisma/client";
import { Search, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { MindMapGlyph } from "@/components/mind-map/mind-map-glyph";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { fromNow } from "@/lib/date";
import { readPalette } from "@/lib/mind-map-palette";
import { defaultPalette, MIND_MAP_META, MIND_MAP_ORDER, mindMapColor } from "@/lib/mind-maps";
import { cn, deaccent } from "@/lib/utils";
import { clearMindMaps, deleteMindMap } from "@/server/actions/mind-map";

export type MapListEntry = {
  id: string;
  title: string;
  type: MindMapType;
  updatedAt: string;
  /** The map's own colour, straight off the row. Null means its type's. */
  hue: number | null;
  tone: string | null;
};

/**
 * Every map in the workspace, as something to open.
 *
 * This did not exist. Maps already made were reachable only through a `…` on the
 * matching type card, grouped by type and one click away — which was a defensible
 * arrangement while a workspace held a handful of them, and stopped being one at
 * fifty-nine. The reasoning behind the old shape was that you arrive here wanting
 * a *kind* of map, so your earlier ones matter only after you have chosen the
 * kind. That is true of the visit where you are making something. It is exactly
 * wrong for the visit where you are going back to a map you already drew, and
 * nothing on the page distinguished the two — six cards that all mean "make a new
 * one", and no sign anywhere that fifty-nine maps existed at all.
 *
 * So the types stay on top as the way to start something, and this is the way
 * back to what is already there.
 */
/** A row's palette: its own if it has one, its type's if it has not. */
function paletteOf(map: MapListEntry) {
  return readPalette(defaultPalette(map.type).hue, map.hue, map.tone);
}

export function MindMapList({
  workspaceSlug,
  workspaceId,
  maps,
  canDelete,
}: {
  workspaceSlug: string;
  workspaceId: string;
  maps: MapListEntry[];
  /** Whether this reader may delete maps — `project:delete`, decided server-side. */
  canDelete: boolean;
}) {
  const router = useRouter();
  const { confirm, dialog } = useConfirm();
  const [query, setQuery] = React.useState("");
  const [only, setOnly] = React.useState<MindMapType | null>(null);

  /**
   * Deleting one map, and clearing them all — both behind a confirmation.
   *
   * The row is a real anchor so middle-click and ⌘-click open a map, which means
   * the delete control cannot live inside it: a button nested in an `<a>` is
   * invalid, and the click would fight the navigation. It sits beside the link
   * instead. `router.refresh()` after a success re-reads the server list rather
   * than trusting this component to keep a mirror of it in step.
   */
  async function removeOne(map: MapListEntry) {
    const result = await deleteMindMap(map.id);
    if (result.success) {
      toast.success(`Deleted “${map.title || "Untitled"}”.`);
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  async function clearAll() {
    const result = await clearMindMaps(workspaceId);
    if (result.success) {
      toast.success(
        result.data.count === 1 ? "Deleted the map." : `Deleted all ${result.data.count} maps.`,
      );
      router.refresh();
    } else {
      toast.error(result.error);
    }
  }

  /**
   * Whether the history is showing at all.
   *
   * Closed to start. The page's job on arrival is the six types — that is what
   * somebody coming here to *make* something needs — and a list of fifty-nine
   * rows above the fold buries them. The chips stay visible either way, so the
   * page still says out loud how many maps exist and of what kind; opening one is
   * a single click, and clicking it again puts the list away.
   */
  const [open, setOpen] = React.useState(false);

  /**
   * A chip is both the filter and the switch. Pressing the one already showing
   * closes the list; pressing any other opens it on that type. One control, and
   * the thing it does is the thing you were looking at.
   */
  function choose(type: MindMapType | null) {
    if (open && only === type) {
      setOpen(false);
      return;
    }
    setOnly(type);
    setOpen(true);
  }

  /**
   * "3 hours ago" is computed after hydration, never on the server.
   *
   * `fromNow` reads the clock at the moment it renders, so the server's answer
   * and the browser's are different strings whenever a minute boundary falls
   * between them — and different again, always, when the two machines are in
   * different time zones, which is the deployed case: the VPS runs UTC and the
   * reader does not. React treats that as a hydration mismatch, and in dev the
   * error overlay it raises sits on top of the page and swallows every click,
   * which is indistinguishable from "none of the buttons work".
   *
   * The type label renders on both sides and the timestamp joins it a frame
   * later. It is one line of secondary text on a row whose purpose is the title,
   * so nothing moves that anyone is aiming at.
   */
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);

  /** Types that actually have maps, so the filter never offers an empty answer. */
  const counts = React.useMemo(() => {
    const out = new Map<MindMapType, number>();
    for (const map of maps) out.set(map.type, (out.get(map.type) ?? 0) + 1);
    return out;
  }, [maps]);

  const shown = React.useMemo(() => {
    // Accent-insensitive, because the titles here are typed in Vietnamese as
    // often as not and "đề" should be found by typing "de". `deaccent` is the
    // same helper the workspace search uses, so the two behave alike.
    const needle = deaccent(query.trim().toLowerCase());
    return maps.filter((map) => {
      if (only && map.type !== only) return false;
      if (!needle) return true;
      return deaccent(map.title.toLowerCase()).includes(needle);
    });
  }, [maps, only, query]);

  if (maps.length === 0) return null;

  return (
    <section className="mt-8 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">
          Maps you have made{" "}
          <span className="font-normal text-muted-foreground">({maps.length})</span>
        </h2>

        <div className="flex items-center gap-2">
          {/* No search box over a list that is not showing. */}
          {open ? (
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search by title"
                aria-label="Search your maps by title"
                className="pl-8"
              />
            </div>
          ) : null}

          {/* Clear everything, behind a confirmation. Only for someone who may
              delete, and it always names the count so the press is deliberate. */}
          {canDelete ? (
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 text-destructive hover:text-destructive"
              onClick={() =>
                confirm({
                  title: `Clear all ${maps.length} maps?`,
                  description:
                    "This permanently deletes every map in this workspace, along with their comments. This cannot be undone.",
                  confirmLabel: "Delete all",
                  destructive: true,
                  onConfirm: clearAll,
                })
              }
            >
              <Trash2 className="size-4" />
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      {/* Counts on the chips, so the page says how many of each there are without
          anybody having to open anything. That number being invisible is most of
          what made fifty-nine maps feel like none. */}
      <div className="flex flex-wrap gap-1.5">
        <FilterChip active={open && only === null} expanded={open && only === null} onClick={() => choose(null)}>
          All {maps.length}
        </FilterChip>
        {MIND_MAP_ORDER.filter((type) => counts.has(type)).map((type) => (
          <FilterChip
            key={type}
            active={open && only === type}
            expanded={open && only === type}
            color={mindMapColor(defaultPalette(type))}
            onClick={() => choose(type)}
          >
            {MIND_MAP_META[type].label} {counts.get(type)}
          </FilterChip>
        ))}
      </div>

      {!open ? null : shown.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No map here matches “{query}”.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((map) => (
            <li
              key={map.id}
              className="group relative flex items-center rounded-lg border transition-colors hover:bg-muted/60"
              style={{ borderColor: mindMapColor(paletteOf(map), 0.3) }}
            >
              {/*
               * A plain link over the body of the row — a real anchor, so
               * middle-click, ⌘-click and "open in new tab" all work. The delete
               * button is a sibling rather than nested inside it: a button in an
               * `<a>` is invalid markup and its click fights the navigation.
               */}
              <Link
                href={`/w/${workspaceSlug}/maps/${map.id}`}
                className="flex min-w-0 flex-1 items-center gap-3 p-3"
              >
                {/* The glyph wears the map's colour, not its type's. Two circle
                    maps side by side are two drawings, and the colour is the
                    only thing on a row that says which is which before you have
                    read the titles. */}
                <MindMapGlyph type={map.type} palette={paletteOf(map)} className="h-8 w-12 shrink-0" />
                <span className="min-w-0 flex-1">
                  {/* Titles are free text and some of them are one long word.
                      Without the truncate a single one stretches its column and
                      drags the whole grid out of line. */}
                  <span className="block truncate text-sm font-medium">
                    {map.title || "Untitled"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {MIND_MAP_META[map.type].label}
                    {mounted ? ` · ${fromNow(map.updatedAt)}` : null}
                  </span>
                </span>
              </Link>

              {canDelete ? (
                <button
                  type="button"
                  aria-label={`Delete ${map.title || "Untitled"}`}
                  onClick={() =>
                    confirm({
                      title: "Delete this map?",
                      description: `“${map.title || "Untitled"}” and its comments will be permanently deleted. This cannot be undone.`,
                      confirmLabel: "Delete",
                      destructive: true,
                      onConfirm: () => removeOne(map),
                    })
                  }
                  className="mr-2 shrink-0 rounded-md p-2 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {dialog}
    </section>
  );
}

function FilterChip({
  active,
  expanded,
  color,
  onClick,
  children,
}: {
  active: boolean;
  /** Also the disclosure state: this chip is the one holding the list open. */
  expanded: boolean;
  color?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-expanded={expanded}
      className={cn(
        "rounded-full border px-2.5 py-1 text-xs transition-colors",
        active ? "bg-foreground text-background" : "hover:bg-muted",
      )}
      style={active || !color ? undefined : { borderColor: color }}
    >
      {children}
    </button>
  );
}
