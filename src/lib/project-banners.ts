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
];

export function bannerPresetCss(id: string | null | undefined): string | null {
  if (!id) return null;
  return BANNER_PRESETS.find((preset) => preset.id === id)?.css ?? null;
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
