import { Bell, Rocket } from "lucide-react";
import { describe, expect, it } from "vitest";

import { NOTIFICATION_META, PROJECT_ICONS } from "@/lib/constants";
import { ICON_REGISTRY, resolveNamedIcon } from "@/lib/icon-registry";

/**
 * The registry exists so the bundler can see which icons are reachable, which
 * means the icons are named in two places and can drift apart. Drift is silent:
 * a name with no entry resolves to the fallback, so the wrong picture is drawn
 * and nothing fails. These assert the cover rather than the contents.
 */
describe("icon registry", () => {
  it("covers every icon a project can be given", () => {
    const missing = PROJECT_ICONS.filter((name) => !Object.hasOwn(ICON_REGISTRY, name));
    expect(missing).toEqual([]);
  });

  it("covers every icon a notification can carry", () => {
    const missing = Object.entries(NOTIFICATION_META)
      .filter(([, meta]) => !Object.hasOwn(ICON_REGISTRY, meta.icon))
      .map(([type, meta]) => `${type} -> ${meta.icon}`);
    expect(missing).toEqual([]);
  });

  it("resolves a known name to its own icon, not the fallback", () => {
    expect(resolveNamedIcon("Megaphone", Rocket)).toBe(ICON_REGISTRY.Megaphone);
    expect(resolveNamedIcon("Megaphone", Rocket)).not.toBe(Rocket);
  });

  it("falls back for a name the database can hold but the registry does not", () => {
    // An icon dropped from PROJECT_ICONS leaves its rows behind, and a rescued
    // row must still draw something.
    expect(resolveNamedIcon("Biohazard", Rocket)).toBe(Rocket);
    expect(resolveNamedIcon(null, Rocket)).toBe(Rocket);
    expect(resolveNamedIcon(undefined, Bell)).toBe(Bell);
    expect(resolveNamedIcon("", Bell)).toBe(Bell);
  });

  it("does not answer with an inherited property", () => {
    // The name is untrusted input; a plain index would hand back Object's own
    // members, and React would try to render one.
    for (const name of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      expect(resolveNamedIcon(name, Rocket)).toBe(Rocket);
    }
  });
});
