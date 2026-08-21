import type { MapPalette } from "@/lib/mind-map-palette";

/**
 * Scenery a map can be drawn on.
 *
 * ## Drawn, not photographed
 *
 * The obvious way to offer twenty backgrounds is twenty pictures. This project
 * already argued that out once, for the project header, and the note there still
 * applies: gradients "weigh nothing, need no upload, survive any window width
 * without cropping badly, and — the part that matters — their darkness is known
 * in advance, so the title and the controls on top of them stay legible."
 *
 * A map needs more than a gradient — an aurora, a nebula, a circuit board — so
 * each of these is a small SVG document, embedded in the CSS as a data URI. That
 * keeps every one of the guarantees above and adds two more: it is *sharp* at any
 * size, which a photograph behind a canvas people zoom into is not, and it can be
 * rendered and looked at from a test, which is the only way anything here gets
 * checked without a browser.
 *
 * ## Every background carries an accent
 *
 * A nebula with lime edges on it is two designs fighting. So a background names
 * the palette the drawing should wear, and choosing one sets both. The hue and
 * tone columns are unchanged — this fills them in rather than replacing them.
 *
 * ## And its own scheme
 *
 * `scheme` says whether the surface is dark or light, and it is not decoration:
 * a node's label inherits the *theme's* foreground, so a pale background under a
 * dark theme draws white words on cream. The surface sets an explicit ink colour
 * from this instead of trusting the theme.
 */
export type MapBackground = {
  id: string;
  label: string;
  group: "Cosmos" | "Nature" | "Technology" | "Colour";
  /** How dark the surface is, so whatever sits on it can pick readable ink. */
  scheme: "dark" | "light";
  /** The accent the drawing wears on top of it. */
  palette: MapPalette;
  /** The colour under the artwork; also what shows through anywhere it does not reach. */
  base: string;
  /** The artwork itself, as a standalone SVG document. */
  svg: string;
};

const W = 1200;
const H = 800;

function doc(inner: string, background = "none") {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" ` +
    `preserveAspectRatio="xMidYMid slice">` +
    (background === "none" ? "" : `<rect width="${W}" height="${H}" fill="${background}"/>`) +
    inner +
    `</svg>`
  );
}

/** A soft blob of colour — the building block of every cloudy background here. */
function blob(cx: number, cy: number, rx: number, ry: number, colour: string, opacity: number) {
  return (
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${colour}" ` +
    `opacity="${opacity}" filter="url(#soft)"/>`
  );
}

/** One `feGaussianBlur`, reused by every blob in a document. */
const SOFT = `<defs><filter id="soft" x="-75%" y="-75%" width="250%" height="250%">
<feGaussianBlur stdDeviation="90"/></filter></defs>`;

/**
 * Stars as a tiled pattern rather than a thousand elements.
 *
 * Two hundred circles would be two hundred circles in the document and in
 * memory; a 300px tile repeated is a handful, and nobody reads a star field for
 * its arrangement.
 */
function starPattern(id: string, colour: string) {
  const dots = [
    [18, 34, 1.4, 0.9], [122, 61, 1, 0.6], [214, 21, 1.7, 0.85], [263, 140, 1.1, 0.5],
    [56, 158, 1.9, 0.95], [175, 191, 1.2, 0.6], [96, 246, 1.5, 0.8], [231, 268, 1, 0.45],
    [289, 205, 1.3, 0.7], [11, 271, 1.1, 0.55], [148, 108, 0.9, 0.4], [200, 92, 2.1, 1],
  ]
    .map(([x, y, r, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${colour}" opacity="${o}"/>`)
    .join("");
  return `<pattern id="${id}" width="300" height="300" patternUnits="userSpaceOnUse">${dots}</pattern>`;
}

export const MAP_BACKGROUNDS: MapBackground[] = [
  {
    id: "nebula",
    label: "Nebula",
    group: "Cosmos",
    scheme: "dark",
    palette: { hue: 276, tone: "vivid" },
    base: "#08050f",
    svg: doc(
      SOFT +
        `<defs>${starPattern("st", "#ffffff")}</defs>` +
        blob(320, 250, 340, 260, "#7c3aed", 0.55) +
        blob(820, 300, 300, 240, "#db2777", 0.4) +
        blob(600, 620, 420, 220, "#1d4ed8", 0.45) +
        blob(1050, 640, 260, 200, "#0891b2", 0.3) +
        `<rect width="${W}" height="${H}" fill="url(#st)" opacity="0.75"/>`,
      "#08050f",
    ),
  },
  {
    id: "aurora",
    label: "Aurora",
    group: "Nature",
    scheme: "dark",
    palette: { hue: 158, tone: "vivid" },
    base: "#03121a",
    svg: doc(
      SOFT +
        `<defs>${starPattern("st2", "#dbeafe")}</defs>` +
        `<rect width="${W}" height="${H}" fill="url(#st2)" opacity="0.5"/>` +
        `<path d="M0 300 C 260 140 420 420 700 250 S 1050 120 1200 260 L1200 470 C 980 350 760 560 520 430 S 180 470 0 520 Z" fill="#22c55e" opacity="0.45" filter="url(#soft)"/>` +
        `<path d="M0 380 C 300 250 460 500 760 340 S 1080 240 1200 360 L1200 520 C 940 430 700 620 460 500 S 150 540 0 580 Z" fill="#06b6d4" opacity="0.4" filter="url(#soft)"/>` +
        blob(600, 780, 700, 160, "#0f172a", 0.85),
      "#03121a",
    ),
  },
  {
    id: "starfield",
    label: "Star field",
    group: "Cosmos",
    scheme: "dark",
    palette: { hue: 214, tone: "deep" },
    base: "#04060f",
    svg: doc(
      SOFT +
        `<defs>${starPattern("st3", "#ffffff")}</defs>` +
        blob(600, 400, 620, 180, "#1e3a8a", 0.35) +
        `<rect width="${W}" height="${H}" fill="url(#st3)"/>`,
      "#04060f",
    ),
  },
  {
    id: "mesh",
    label: "Gradient mesh",
    group: "Colour",
    scheme: "dark",
    palette: { hue: 300, tone: "vivid" },
    base: "#160b22",
    svg: doc(
      SOFT +
        blob(240, 200, 460, 360, "#f472b6", 0.6) +
        blob(880, 180, 440, 340, "#8b5cf6", 0.6) +
        blob(300, 640, 460, 340, "#38bdf8", 0.5) +
        blob(950, 640, 460, 360, "#f59e0b", 0.45) +
        blob(600, 400, 420, 300, "#a855f7", 0.4),
      "#160b22",
    ),
  },
  {
    id: "bokeh",
    label: "Bokeh",
    group: "Colour",
    scheme: "dark",
    palette: { hue: 268, tone: "soft" },
    base: "#080a16",
    svg: doc(
      `<defs><filter id="b" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="42"/></filter></defs>` +
        [
          [180, 200, 90, "#f472b6", 0.5], [420, 120, 55, "#38bdf8", 0.45],
          [760, 220, 110, "#a78bfa", 0.4], [1010, 130, 60, "#fbbf24", 0.4],
          [260, 600, 130, "#22d3ee", 0.35], [620, 640, 80, "#f97316", 0.4],
          [900, 560, 100, "#818cf8", 0.45], [1120, 700, 70, "#ec4899", 0.35],
          [520, 400, 45, "#ffffff", 0.25], [860, 380, 35, "#ffffff", 0.2],
        ]
          .map(([x, y, r, c, o]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${c}" opacity="${o}" filter="url(#b)"/>`)
          .join(""),
      "#080a16",
    ),
  },
  {
    id: "honeycomb",
    label: "Honeycomb",
    group: "Technology",
    scheme: "dark",
    palette: { hue: 286, tone: "vivid" },
    base: "#0a0713",
    svg: doc(
      SOFT +
        `<defs><pattern id="hex" width="104" height="180" patternUnits="userSpaceOnUse">` +
        `<path d="M52 0 L104 30 L104 90 L52 120 L0 90 L0 30 Z M52 90 L104 120 L104 180 L52 210 L0 180 L0 120 Z" ` +
        `fill="none" stroke="#a78bfa" stroke-width="1.1" opacity="0.22"/></pattern></defs>` +
        `<rect width="${W}" height="${H}" fill="url(#hex)"/>` +
        blob(300, 250, 340, 260, "#7c3aed", 0.35) +
        blob(950, 600, 340, 240, "#c026d3", 0.3),
      "#0a0713",
    ),
  },
  {
    id: "circuit",
    label: "Circuit",
    group: "Technology",
    scheme: "dark",
    palette: { hue: 196, tone: "vivid" },
    base: "#04101a",
    svg: doc(
      SOFT +
        `<defs><pattern id="cir" width="260" height="260" patternUnits="userSpaceOnUse">` +
        `<path d="M20 0 V70 H130 V150 H260 M130 260 V150 M0 200 H70 V260 M180 40 H260 M180 40 V110 H240" fill="none" stroke="#22d3ee" stroke-width="1.3" opacity="0.26"/>` +
        `<circle cx="130" cy="150" r="3.4" fill="#22d3ee" opacity="0.55"/>` +
        `<circle cx="20" cy="70" r="2.6" fill="#38bdf8" opacity="0.45"/>` +
        `<circle cx="180" cy="40" r="2.6" fill="#22d3ee" opacity="0.4"/></pattern></defs>` +
        `<rect width="${W}" height="${H}" fill="url(#cir)"/>` +
        blob(250, 620, 340, 240, "#0e7490", 0.4) +
        blob(980, 200, 320, 240, "#1d4ed8", 0.35),
      "#04101a",
    ),
  },
  {
    id: "ocean",
    label: "Ocean depth",
    group: "Nature",
    scheme: "dark",
    palette: { hue: 194, tone: "deep" },
    base: "#03141f",
    svg: doc(
      SOFT +
        `<defs><linearGradient id="og" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="#0e7490"/><stop offset="1" stop-color="#03141f"/></linearGradient></defs>` +
        `<rect width="${W}" height="${H}" fill="url(#og)" opacity="0.85"/>` +
        [140, 340, 560, 820, 1030]
          .map(
            (x, i) =>
              `<path d="M${x} -40 L${x + 90 + i * 12} ${H} L${x + 150 + i * 12} ${H} L${x + 60} -40 Z" fill="#a5f3fc" opacity="0.09"/>`,
          )
          .join("") +
        blob(600, 760, 700, 180, "#020a12", 0.9),
      "#03141f",
    ),
  },
  {
    id: "sunburst",
    label: "Sunburst",
    group: "Colour",
    scheme: "dark",
    palette: { hue: 32, tone: "vivid" },
    base: "#100702",
    svg: doc(
      SOFT +
        `<g transform="translate(600 400)">` +
        Array.from({ length: 24 })
          .map((_, i) => {
            const a = (i * 360) / 24;
            return `<path d="M0 0 L900 -26 L900 26 Z" transform="rotate(${a})" fill="#f59e0b" opacity="0.13"/>`;
          })
          .join("") +
        `</g>` +
        blob(600, 400, 260, 260, "#f97316", 0.75) +
        blob(600, 400, 120, 120, "#fde68a", 0.7),
      "#100702",
    ),
  },
  {
    id: "constellation",
    label: "Constellation",
    group: "Technology",
    scheme: "dark",
    palette: { hue: 224, tone: "vivid" },
    base: "#060a16",
    svg: doc(
      SOFT +
        `<defs><pattern id="net" width="420" height="420" patternUnits="userSpaceOnUse">` +
        `<path d="M50 70 L260 30 L360 210 L150 300 Z M260 30 L400 330 M50 70 L110 350 M360 210 L400 330" fill="none" stroke="#60a5fa" stroke-width="0.9" opacity="0.22"/>` +
        `<circle cx="50" cy="70" r="2.6" fill="#93c5fd" opacity="0.7"/>` +
        `<circle cx="260" cy="30" r="2" fill="#a5b4fc" opacity="0.6"/>` +
        `<circle cx="360" cy="210" r="2.8" fill="#60a5fa" opacity="0.7"/>` +
        `<circle cx="150" cy="300" r="2.2" fill="#93c5fd" opacity="0.5"/></pattern></defs>` +
        `<rect width="${W}" height="${H}" fill="url(#net)"/>` +
        blob(850, 300, 360, 260, "#1e40af", 0.4),
      "#060a16",
    ),
  },
  {
    id: "grid",
    label: "Minimal grid",
    group: "Technology",
    scheme: "dark",
    palette: { hue: 220, tone: "mono" },
    base: "#0a0c11",
    svg: doc(
      SOFT +
        `<defs><pattern id="g" width="48" height="48" patternUnits="userSpaceOnUse">` +
        `<path d="M48 0 H0 V48" fill="none" stroke="#94a3b8" stroke-width="0.8" opacity="0.3"/></pattern></defs>` +
        `<rect width="${W}" height="${H}" fill="url(#g)"/>` +
        blob(600, 400, 560, 340, "#1e293b", 0.3),
      "#0a0c11",
    ),
  },
  {
    id: "meadow",
    label: "Meadow",
    group: "Nature",
    scheme: "light",
    palette: { hue: 150, tone: "deep" },
    base: "#eef7ee",
    svg: doc(
      SOFT +
        blob(220, 180, 340, 240, "#a7f3d0", 0.85) +
        blob(900, 220, 340, 240, "#bae6fd", 0.8) +
        blob(560, 660, 420, 260, "#fde68a", 0.6) +
        blob(1080, 640, 280, 220, "#c7d2fe", 0.6),
      "#eef7ee",
    ),
  },
  {
    id: "paper",
    label: "Paper",
    group: "Colour",
    scheme: "light",
    palette: { hue: 24, tone: "deep" },
    base: "#f6f1e7",
    svg: doc(
      SOFT +
        `<defs><pattern id="dots" width="26" height="26" patternUnits="userSpaceOnUse">` +
        `<circle cx="3" cy="3" r="1.2" fill="#8d7f6b" opacity="0.38"/></pattern></defs>` +
        `<rect width="${W}" height="${H}" fill="url(#dots)"/>` +
        blob(240, 620, 320, 220, "#fbcfe8", 0.5) +
        blob(980, 200, 320, 220, "#bfdbfe", 0.45),
      "#f6f1e7",
    ),
  },
];

/** The artwork as something CSS can use. */
export function backgroundImage(background: MapBackground): string {
  return `url("data:image/svg+xml,${encodeURIComponent(background.svg)}")`;
}

/** Looks one up by id, tolerating an id this build does not know. */
export function findBackground(id: string | null | undefined): MapBackground | null {
  if (!id) return null;
  return MAP_BACKGROUNDS.find((item) => item.id === id) ?? null;
}

/**
 * The colour words take on a given background.
 *
 * A node's label would otherwise inherit the theme's foreground, and the theme
 * knows nothing about what the map is standing on — light words on a paper
 * background is the failure, and it happens only for whoever has the dark theme
 * on, which is the hardest kind of bug to be told about.
 */
export function backgroundInk(background: MapBackground | null): string | undefined {
  if (!background) return undefined;
  return background.scheme === "light" ? "#111827" : "#e5e7eb";
}

/**
 * What a map is actually standing on, read from the two columns.
 *
 * Both are nullable and either can hold something this build cannot use — an id
 * from a later version, a link whose host has since gone. Neither is worth an
 * error on screen: the map falls back to the plain backdrop built from its hue,
 * which is what it had before anybody chose scenery.
 */
export type MapScenery =
  | { kind: "preset"; background: MapBackground }
  | { kind: "url"; url: string }
  | null;

/**
 * Whether a link is safe to write into a CSS `url(...)`.
 *
 * Strict, and not "does `new URL` accept it". This string is interpolated into a
 * style declaration, so a quote, a bracket or a backslash in it is a way out of
 * the function it sits in. https only, because the page is https and a picture
 * fetched over http would be blocked as mixed content anyway — refusing it here
 * means saying so, rather than storing a link that silently shows nothing.
 */
export function isSafeImageUrl(value: string): boolean {
  if (value.length > 2048) return false;
  if (!/^https:\/\/[^\s"'()\\<>{}]+$/.test(value)) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function readScenery(
  kind: string | null | undefined,
  value: string | null | undefined,
): MapScenery {
  if (!kind || !value) return null;
  if (kind === "preset") {
    const background = findBackground(value);
    return background ? { kind: "preset", background } : null;
  }
  if (kind === "url" && isSafeImageUrl(value)) return { kind: "url", url: value };
  return null;
}

/**
 * The scenery as CSS, or nothing when there is none.
 *
 * `cover` and a centred position: a map is any shape a window is, and a picture
 * that tiles behind a drawing reads as a rendering fault rather than as
 * wallpaper. The colour underneath is painted too, so the moment before a linked
 * picture arrives is a flat colour rather than a flash of the page behind.
 */
export function sceneryCss(scenery: MapScenery): Record<string, string> | null {
  if (!scenery) return null;
  if (scenery.kind === "preset") {
    return {
      backgroundColor: scenery.background.base,
      backgroundImage: backgroundImage(scenery.background),
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return {
    backgroundColor: "#0b1020",
    backgroundImage: `url("${scenery.url}")`,
    backgroundSize: "cover",
    backgroundPosition: "center",
  };
}

/**
 * The ink for words sitting on this scenery.
 *
 * A linked picture is somebody else's and nothing here knows how dark it is, so
 * it gets the dark-surface ink and a scrim behind the header rather than a
 * guess — see the surface.
 */
export function sceneryInk(scenery: MapScenery): string | undefined {
  if (!scenery) return undefined;
  return scenery.kind === "preset" ? backgroundInk(scenery.background) : "#e5e7eb";
}
