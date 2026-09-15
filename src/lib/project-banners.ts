/**
 * Built-in backdrops for the project header.
 *
 * Gradients rather than pictures: they weigh nothing, need no upload, survive
 * any window width without cropping badly, and — the part that matters — their
 * darkness is known in advance, so the title and the controls on top of them
 * stay legible. An arbitrary photograph offers none of those guarantees, which
 * is why the upload path dims whatever it is given.
 *
 * `css` is a full `background` value. Each ends dark at the bottom so the
 * header's own border reads as an edge rather than a seam.
 */
export type BannerPreset = {
  id: string;
  label: string;
  css: string;
  /**
   * A pale pastel rather than a dark gradient.
   *
   * It changes only how the header veils it: a dark preset is *whitened* in
   * light mode so dark text reads and *barely* touched in dark mode; a light one
   * is the opposite — shown almost bare in light mode and *darkened* in dark mode
   * so the light header text reads on it. The luminance the veil has to move
   * toward is different, so the header needs to know which family a banner is.
   */
  light?: boolean;
};

export const BANNER_PRESETS: BannerPreset[] = [
  {
    id: "aurora",
    label: "Aurora",
    css: "linear-gradient(125deg, #0b1020 0%, #1b2a6b 42%, #2f6f8f 68%, #0b1020 100%)",
  },
  {
    id: "ember",
    label: "Ember",
    css: "linear-gradient(125deg, #1a0f0a 0%, #7c2d12 45%, #b45309 70%, #1a0f0a 100%)",
  },
  {
    id: "orchid",
    label: "Orchid",
    css: "linear-gradient(125deg, #150b22 0%, #5b21b6 45%, #a21caf 72%, #150b22 100%)",
  },
  {
    id: "moss",
    label: "Moss",
    css: "linear-gradient(125deg, #06140f 0%, #065f46 45%, #0f766e 72%, #06140f 100%)",
  },
  {
    id: "dusk",
    label: "Dusk",
    css: "linear-gradient(125deg, #0d0b18 0%, #3f3d6b 40%, #8b5a7c 68%, #0d0b18 100%)",
  },
  {
    id: "slate",
    label: "Slate",
    css: "linear-gradient(125deg, #0b0f16 0%, #1f2937 45%, #334155 72%, #0b0f16 100%)",
  },

  // Brand-inspired pastels — light by design, for a bright header.
  {
    id: "indigo-light",
    label: "Indigo Light",
    css: "linear-gradient(120deg, #e0e7ff 0%, #a5b4fc 58%, #c7d2fe 100%)",
    light: true,
  },
  {
    id: "violet-light",
    label: "Violet Light",
    css: "linear-gradient(120deg, #ede9fe 0%, #c4b5fd 55%, #f0abfc 100%)",
    light: true,
  },
  {
    id: "blue-light",
    label: "Blue Light",
    css: "linear-gradient(120deg, #dbeafe 0%, #93c5fd 55%, #bae6fd 100%)",
    light: true,
  },
  {
    id: "pink-light",
    label: "Pink Light",
    css: "linear-gradient(120deg, #fce7f3 0%, #f9a8d4 55%, #fbcfe8 100%)",
    light: true,
  },
  {
    id: "teal-light",
    label: "Teal Light",
    css: "linear-gradient(120deg, #ccfbf1 0%, #5eead4 55%, #a7f3d0 100%)",
    light: true,
  },
  {
    id: "amber-light",
    label: "Amber Light",
    css: "linear-gradient(120deg, #fef3c7 0%, #fcd34d 55%, #fdba74 100%)",
    light: true,
  },
];

export function bannerPresetCss(id: string | null | undefined): string | null {
  if (!id) return null;
  return BANNER_PRESETS.find((preset) => preset.id === id)?.css ?? null;
}

/** Whether a banner id names one of the pale, light-family presets. */
export function isLightBanner(id: string | null | undefined): boolean {
  if (!id) return false;
  return BANNER_PRESETS.find((preset) => preset.id === id)?.light === true;
}

/**
 * Accepted uploads. Narrower than the attachment allowlist: a banner is
 * decoration, and a PDF or an SVG has no business being one — SVG in
 * particular can carry script, which is the whole reason attachments refuse to
 * render it inline.
 *
 * GIF is allowed on request. Worth knowing what it costs: an animated one
 * loops behind the project title forever, cannot be paused, and does not stop
 * for `prefers-reduced-motion` the way every other effect here does — a GIF is
 * a picture as far as the browser is concerned. It is also the heaviest way to
 * carry motion, so a few seconds of video-like content easily fills the 4 MB
 * budget on its own.
 */
export const BANNER_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

/** 4 MB. A header strip never needs more, and the limit is what stops someone
 * parking a 30 MB photograph in front of every teammate's page load. */
export const MAX_BANNER_BYTES = 4 * 1024 * 1024;

/**
 * Vets a linked picture, returning a safe absolute URL or null.
 *
 * Three things are being defended against, in order of how badly they end:
 *
 * `https` only. On a site served over TLS a browser silently refuses to load
 * an `http` image, so an accepted link would simply never appear — and the
 * owner would be left wondering why. Rejecting it here says so out loud.
 * `javascript:` and `data:` are excluded by the same check.
 *
 * No embedded credentials. `https://user:pass@host/x.png` would store somebody's
 * password in the project row and hand it to every teammate who views the page.
 *
 * Re-serialised through `URL`, never echoed back as typed. The result is used
 * inside a CSS `url("…")`, and a value carrying a quote or a bracket could end
 * that function early. Encoding those characters is what keeps the string a
 * URL rather than the start of a new declaration.
 */
export function sanitiseBannerUrl(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;

  // Encoded by hand rather than with `encodeURIComponent`, which deliberately
  // leaves `( ) ' ! * . - _ ~` alone: they are safe in a URL, and a bracket is
  // exactly what ends a CSS `url()` early. The requirement here is not "valid
  // URL" but "cannot terminate the declaration it sits in".
  return parsed
    .toString()
    .replace(
      /["'()\\\s]/g,
      (char) => `%${char.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`,
    );
}
