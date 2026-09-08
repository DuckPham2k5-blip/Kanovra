import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  guideAsText,
  guideEntryAsText,
  guideForPath,
  PRODUCT_GUIDE,
} from "@/lib/product-guide";

/**
 * The guide is checked for cover, not for truth.
 *
 * No test can tell whether "the resize grip is the bottom-right corner" is
 * still where the grip is. What a test *can* do is stop the file falling
 * silently behind the application — and silence is the whole problem, because
 * a stale guide does not fail, it just teaches the assistant to describe a
 * product that no longer exists.
 *
 * So this walks the actual route folders. Add a page and this goes red; delete
 * one and it goes red the other way. Same shape as the icon registry's cover
 * test, and for the same reason.
 */

const APP_DIR = join(process.cwd(), "src", "app", "(app)");

/** Every route under `(app)` that has a `page.tsx`, as its route pattern. */
function routesOnDisk(dir = APP_DIR, prefix = ""): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      // A parenthesised folder is a route group and contributes no segment.
      const segment = name.startsWith("(") && name.endsWith(")") ? prefix : `${prefix}/${name}`;
      found.push(...routesOnDisk(full, segment));
    } else if (name === "page.tsx") {
      found.push(prefix || "/");
    }
  }
  return found;
}

describe("the guide covers the application", () => {
  const onDisk = routesOnDisk().sort();
  const described = PRODUCT_GUIDE.map((e) => e.route).sort();

  it("finds the routes at all, so an empty walk cannot pass silently", () => {
    // Without this, a wrong APP_DIR makes both lists empty and every
    // assertion below succeeds while proving nothing.
    expect(onDisk.length).toBeGreaterThanOrEqual(10);
    expect(onDisk).toContain("/w/[slug]/projects/[projectId]/board");
  });

  it("describes every page that exists", () => {
    const missing = onDisk.filter((r) => !described.includes(r));
    expect(missing, `pages with no entry in product-guide.ts: ${missing.join(", ")}`).toEqual([]);
  });

  it("describes no page that does not exist", () => {
    const extra = described.filter((r) => !onDisk.includes(r));
    expect(extra, `entries naming a route with no page.tsx: ${extra.join(", ")}`).toEqual([]);
  });

  it("has no duplicate routes", () => {
    expect(new Set(described).size).toBe(described.length);
  });
});

describe("every entry is usable", () => {
  it.each(PRODUCT_GUIDE.map((e) => [e.name, e] as const))(
    "%s says what it is for and what is on it",
    (_name, entry) => {
      expect(entry.purpose.length).toBeGreaterThan(20);
      expect(entry.controls.length).toBeGreaterThan(0);
      for (const control of entry.controls) {
        expect(control.label.trim()).not.toBe("");
        // "Where" is the half an assistant cannot invent and the half a reader
        // needs; an entry without it is the failure this file exists to stop.
        expect(control.where.trim(), `${entry.name} → ${control.label}`).not.toBe("");
        expect(control.does.trim(), `${entry.name} → ${control.label}`).not.toBe("");
      }
    },
  );
});

describe("guideForPath", () => {
  it("matches a concrete path to its pattern", () => {
    expect(guideForPath("/w/acme/projects/abc123/board")?.name).toBe("Kanban board");
    expect(guideForPath("/w/acme/my-tasks")?.name).toBe("My tasks");
    expect(guideForPath("/w/acme")?.name).toBe("Overview");
    expect(guideForPath("/w/acme/maps/map_1")?.name).toBe("Map canvas");
  });

  it("does not confuse routes of different depth", () => {
    // `/w/[slug]/projects` and `/w/[slug]/projects/[projectId]` differ only by
    // a segment, and a looser matcher answers both with whichever came first.
    expect(guideForPath("/w/acme/projects")?.name).toBe("Projects");
    expect(guideForPath("/w/acme/projects/abc123")?.name).toBe("Project");
  });

  it("ignores a query string", () => {
    expect(guideForPath("/w/acme/projects/abc/board?task=t1")?.name).toBe("Kanban board");
  });

  /*
   * Nothing rather than a guess. An assistant that describes the wrong page is
   * worse than one that says it does not know which page you are on: the reader
   * has no way to tell the two apart, and follows the wrong instructions.
   */
  it("answers with nothing for a path it does not know", () => {
    expect(guideForPath("/share/abc")).toBeUndefined();
    expect(guideForPath("/w/acme/nope")).toBeUndefined();
    expect(guideForPath("/")).toBeUndefined();
    expect(guideForPath("")).toBeUndefined();
  });
});

describe("rendering for the model", () => {
  it("puts the label, what it does and where it is on one line", () => {
    const board = PRODUCT_GUIDE.find((e) => e.route.endsWith("/board"))!;
    const text = guideEntryAsText(board);
    expect(text).toContain("Kanban board");
    expect(text).toContain("Where:");
    expect(text).toContain("Needs:");
  });

  it("renders the whole guide as one block naming every page", () => {
    const text = guideAsText();
    for (const entry of PRODUCT_GUIDE) expect(text).toContain(entry.name);
  });

  /*
   * A rough ceiling, not a style rule. This text is sent on every conversation,
   * so unbounded growth here is a bill and a slower first token on every
   * question anybody asks.
   */
  it("stays small enough to send every time", () => {
    expect(guideAsText().length).toBeLessThan(24_000);
  });
});
