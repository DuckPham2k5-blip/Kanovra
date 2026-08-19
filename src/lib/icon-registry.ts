import {
  AlertTriangle,
  AtSign,
  Bell,
  Boxes,
  CheckCircle2,
  Clock,
  Code2,
  Cpu,
  Database,
  FolderKanban,
  Globe,
  LineChart,
  Mail,
  Megaphone,
  MessageSquare,
  Palette,
  Rocket,
  ShoppingCart,
  Smartphone,
  Sparkles,
  UserPlus,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/**
 * Every lucide icon this application can name at runtime, imported explicitly.
 *
 * Three components used to reach for `import * as Icons from "lucide-react"`
 * because the name of the icon is a string held in the database or in
 * `NOTIFICATION_META`, and a namespace import is the obvious way to look one
 * up. It cost **503 kB — all 1528 icons** — in a single chunk, for the 22 named
 * below. A runtime string index gives the bundler nothing to shake against, and
 * Next's `optimizePackageImports`, which handles a named import from this
 * package perfectly well, cannot touch a namespace one. Naming them here keeps
 * the lookup and drops the rest.
 *
 * So this list is not decoration: adding an icon name to `PROJECT_ICONS` or
 * `NOTIFICATION_META` without adding it here leaves that icon resolving to a
 * fallback — the wrong picture, silently, with nothing failing.
 * `icon-registry.test.ts` asserts the cover.
 */
export const ICON_REGISTRY: Record<string, LucideIcon> = {
  AlertTriangle,
  AtSign,
  Bell,
  Boxes,
  CheckCircle2,
  Clock,
  Code2,
  Cpu,
  Database,
  FolderKanban,
  Globe,
  LineChart,
  Mail,
  Megaphone,
  MessageSquare,
  Palette,
  Rocket,
  ShoppingCart,
  Smartphone,
  Sparkles,
  UserPlus,
  Users,
};

/**
 * Resolves an icon by name, falling back rather than throwing — the name comes
 * from a database column and a stale value must never crash a render.
 *
 * `Object.hasOwn` rather than a plain index: the name is untrusted, and
 * `ICON_REGISTRY["constructor"]` on an ordinary object literal answers with
 * something truthy that React would then try to render.
 */
export function resolveNamedIcon(
  name: string | null | undefined,
  fallback: LucideIcon,
): LucideIcon {
  if (!name) return fallback;
  return Object.hasOwn(ICON_REGISTRY, name) ? ICON_REGISTRY[name] : fallback;
}
