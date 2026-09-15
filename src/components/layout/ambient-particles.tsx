"use client";

import * as React from "react";

import {
  bloomBox,
  moteAlpha,
  moteAt,
  moteCount,
  moteInk,
  motePath,
  moteRadius,
  type MotePath,
} from "@/lib/ambient-motes";

/**
 * Drifting motes over the ambient backdrop.
 *
 * A canvas, not elements. A few hundred divs animated through React is a
 * different order of cost, and this runs on every page of the app at once.
 *
 * Where they go depends on the theme, which is what was asked for: on the light
 * theme they fall inward toward the bloom and wink out as they reach it, and on
 * the dark theme they do the reverse, spreading outward from it and fading at the
 * edges of the screen.
 *
 * Either way the fixed end of the path is the *bloom*, not the middle of the
 * viewport. The bloom is the shape the page's colour actually lives in and it
 * sits high and off-centre — `top: -13rem` on a box `44rem` tall — so aiming at
 * the geometric middle would have every mote miss the thing it is falling into
 * by about a third of the screen.
 *
 * Colour is read from `--page-accent`, the same registered custom property the
 * bloom, the arcs and the nav share. It is registered as a `<color>`, so it
 * interpolates during the 700ms route transition — sampling it a few times a
 * second means the motes cross-fade with the rest of the page instead of
 * snapping to the new hue on their own schedule.
 */
export function AmbientParticles() {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const context = element.getContext("2d");
    if (!context) return;

    // Re-bound as non-null locals because the helpers below are function
    // declarations, and TypeScript drops a narrowing at the boundary of a
    // hoisted function — it cannot know when one will be called. The
    // alternative is a `!` on every use inside them, which is the same claim
    // made repeatedly and unchecked instead of once and checked.
    const canvas: HTMLCanvasElement = element;
    const ctx: CanvasRenderingContext2D = context;

    /*
     * Reduced motion removes the travel and keeps everything else.
     *
     * The preference is about things moving under the eye, and a field of motes
     * crossing the screen is squarely that. A mote sitting still and breathing in
     * brightness is not — it is the same call already made for the glyph and the
     * accent cross-fade, and it matters here because the person who asked for
     * this effect has the preference switched on. Dropping the layer outright
     * would mean they never see it.
     */
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");

    type Mote = {
      path: MotePath;
      /** Distance along its own path, 0 at the spawn edge and 1 at the target. */
      t: number;
      speed: number;
      /** Fixed 0–1 roll; the drawn radius is derived from it every frame, so a
          theme switch resizes the whole field at once. */
      roll: number;
      /** Phase offset so they do not all breathe together. */
      phase: number;
      /** Its own twinkle rate, so the field does not pulse as one. */
      twinkle: number;
      /**
       * How far the twinkle swings, and the level it swings around. Two kinds of
       * mote share the sky: a deep blinker that all but winks out and back, and a
       * faint one that only shimmers — a real sky is mostly the second with a
       * scattering of the first, which is what keeps the field from reading as one
       * flat pulsing sheet.
       */
      twAmp: number;
      twMid: number;
    };

    let motes: Mote[] = [];
    let width = 0;
    let height = 0;
    let accent = "rgb(129 140 248)";
    let dark = document.documentElement.classList.contains("dark");
    let frame = 0;
    let last = performance.now();
    let sampled = 0;

    /**
     * Gives a mote a fresh path. Angle first, radius second, so they scatter
     * rather than band.
     *
     * Seeding scatters them along those paths too, or the whole field arrives at
     * once on the first frame and again on every resize.
     */
    function spawn(mote: Mote, seeded: boolean) {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const reach = Math.max(width, height) * (0.55 + Math.random() * 0.5);

      mote.path = motePath(bloomBox(width, rem), Math.random() * Math.PI * 2, reach, dark);
      mote.t = seeded ? Math.random() : 0;
      mote.speed = 0.02 + Math.random() * 0.05;
      mote.roll = Math.random();
      mote.phase = Math.random() * Math.PI * 2;
      mote.twinkle = 0.6 + Math.random() * 1.1;
      // About a third blink deeply (down to ~0.1 and back), the rest only
      // shimmer (staying near full). Amplitude and midpoint together, so a deep
      // blinker's floor cannot dip below zero.
      if (Math.random() < 0.35) {
        mote.twAmp = 0.45;
        mote.twMid = 0.55;
      } else {
        mote.twAmp = 0.12;
        mote.twMid = 0.88;
      }
    }

    /**
     * Sizes the canvas to the layer it fills, and rebuilds the field.
     *
     * Measured from the parent rather than from `window.innerWidth`, and driven
     * by a `ResizeObserver` rather than the window's `resize` event, because of
     * a real failure: a page that loads while its tab is in the background gets
     * a viewport of zero, sizes everything to zero, and then never hears a
     * `resize` — showing a tab does not fire one. The layer stayed blank until
     * somebody happened to drag the window. Caught by opening the page and
     * finding `width: 0px` on the element.
     *
     * Zero is therefore ignored rather than stored, and an unchanged size is
     * skipped so a slow window drag does not respawn the whole field per frame.
     */
    function resize() {
      const box = canvas.parentElement?.getBoundingClientRect();
      const nextW = Math.round(box?.width || window.innerWidth);
      const nextH = Math.round(box?.height || window.innerHeight);
      if (!nextW || !nextH) return;
      if (nextW === width && nextH === height) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = nextW;
      height = nextH;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      motes = Array.from({ length: moteCount(width, height) }, () => {
        const mote: Mote = {
          path: { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } },
          t: 0,
          speed: 0,
          roll: 0,
          phase: 0,
          twinkle: 1,
          twAmp: 0.12,
          twMid: 0.88,
        };
        spawn(mote, true);
        return mote;
      });
    }

    function draw(now: number) {
      const elapsed = Math.min((now - last) / 1000, 0.05);
      last = now;

      // Style is only re-read a few times a second: `getComputedStyle` forces a
      // recalc, and doing that inside a 60fps loop is how an ambient decoration
      // starts costing more than the page it decorates.
      if (now - sampled > 240) {
        sampled = now;
        const value = getComputedStyle(canvas).getPropertyValue("--page-accent").trim();
        if (value) accent = value;
        dark = document.documentElement.classList.contains("dark");
      }

      ctx.clearRect(0, 0, width, height);

      /*
       * Stars, not dots. The glow is a canvas shadow of the mote's own colour,
       * which is what turns a flat 2px circle into something with a halo — and it
       * is set once for the whole field rather than per mote, because changing
       * `shadowBlur` between fills is one of the more expensive things a 2D
       * context can be asked to do.
       *
       * No halo on the light theme. Black ink glowing black over a pale page is a
       * grey smear, and the point there is a crisp speck.
       */
      const ink = moteInk(dark, accent);
      ctx.fillStyle = ink;
      ctx.shadowColor = dark ? ink : "transparent";
      ctx.shadowBlur = dark ? 8 : 0;

      const still = calm.matches;

      for (const mote of motes) {
        if (!still) {
          mote.t += mote.speed * elapsed;
          if (mote.t >= 1) {
            spawn(mote, false);
            continue;
          }
        }

        // Halfway along under reduced motion: it never advances, so it holds a
        // position that is fully lit and is not the edge it would have died at.
        const t = still ? 0.5 : mote.t;
        const at = moteAt(mote.path, t);

        // The twinkle: each mote on its own rate, or the whole sky pulses as one
        // object and reads as a single flashing thing rather than as many. Its
        // own depth too — a deep blinker or a faint shimmer — set once at spawn.
        // Under reduced motion this is all that is left of the animation, which is
        // why the deep ones go deep enough to be worth watching on their own.
        const twinkle = mote.twMid + mote.twAmp * Math.sin((now / 900) * mote.twinkle + mote.phase);

        const radius = moteRadius(mote.roll, dark);

        ctx.globalAlpha = moteAlpha(t, dark) * twinkle;
        ctx.beginPath();
        ctx.arc(at.x, at.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // A white core on the brightest few, which is what makes a star look lit
        // from inside rather than painted on. Only worth drawing where there is a
        // dark sky behind it — on the light theme these are specks of ink, and a
        // white middle would just hollow them out.
        if (dark && radius > 2.2) {
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.arc(at.x, at.y, radius * 0.38, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = ink;
        }
      }

      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      frame = requestAnimationFrame(draw);
    }

    function start() {
      if (frame) return;
      last = performance.now();
      frame = requestAnimationFrame(draw);
    }

    function stop() {
      if (!frame) return;
      cancelAnimationFrame(frame);
      frame = 0;
    }

    // A hidden tab should cost nothing. `requestAnimationFrame` already throttles
    // hard in the background, but it does not stop, and this runs app-wide.
    function onVisibility() {
      if (document.hidden) stop();
      else start();
    }

    resize();
    start();

    // Fires when the layer first gains a size as well as when it changes, which
    // is the whole point — a background tab has neither until it is shown.
    const observer = new ResizeObserver(() => resize());
    if (canvas.parentElement) observer.observe(canvas.parentElement);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stop();
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className="tf-ambient-particles" />;
}
