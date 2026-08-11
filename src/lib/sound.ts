"use client";

/**
 * Two short cues, synthesised rather than shipped.
 *
 * A couple of sine tones through WebAudio costs nothing to download and
 * nothing to decode, where an mp3 would add binary assets to the repo and a
 * network request to the first notification. It also stays crisp at any
 * volume, which a heavily compressed 20KB ping does not.
 *
 * Browsers refuse to start audio until the visitor has interacted with the
 * page, so an AudioContext created on load arrives `suspended`. Everything
 * here is best-effort: if the context cannot start, the cue is skipped and
 * nothing is logged, because a missing sound must never be the reason a
 * notification fails to appear.
 */

const MUTE_KEY = "tf_sound_muted";

/**
 * The context is parked on `window`, not in a module variable, for the same
 * reason `prisma` and the realtime listener are parked on `globalThis`: in
 * development every edit re-evaluates this module, and module state starts
 * over. A context unlocked by the visitor's click would be thrown away on the
 * next Fast Refresh, and the following cue would build a fresh one with no
 * gesture in sight — which the browser refuses to start, silently. Observed
 * exactly that: the ring appeared, the chime did not, and the console carried
 * "The AudioContext was not allowed to start".
 */
const globalForSound = globalThis as unknown as {
  tfAudio?: { context: AudioContext | null; unlockBound: boolean };
};

const store = (globalForSound.tfAudio ??= { context: null, unlockBound: false });

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (store.context) return store.context;
  const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    store.context = new Ctor();
    return store.context;
  } catch {
    return null;
  }
}

/**
 * Unlock audio on the first click or keypress anywhere on the page.
 *
 * A context created before the visitor has interacted arrives `suspended`, and
 * `resume()` is only granted from inside a gesture. Trying it at the moment a
 * cue needs to play is too late: by then the gesture that would have allowed
 * it is long over, the promise rejects, and the sound is dropped in silence.
 * That is precisely what happened to a page left untouched while it was
 * watched — the ring appeared and the chime never did.
 *
 * Attached when this module loads rather than when the first cue fires, since
 * a cue is exactly the thing that arrives too late to help. One gesture, at
 * any point, and every cue after it finds a running context.
 *
 * `unlockBound` lives on the same global object as the context, so a Fast
 * Refresh re-running this file does not stack a second pair of listeners on
 * every edit.
 */
if (typeof document !== "undefined" && !store.unlockBound) {
  store.unlockBound = true;

  const wake = () => {
    const ctx = audio();
    if (ctx && ctx.state !== "running") void ctx.resume().catch(() => {});
  };

  // Deliberately kept attached rather than removed after the first gesture.
  // A context can go back to sleep — browsers suspend one that has been silent
  // for a while, to save power — and a listener that unhooked itself leaves
  // nobody to wake it again. Measured cost of removing it: 585ms between the
  // ring appearing and the pop being heard, spent asking permission at exactly
  // the moment the sound was due. Cost of keeping it: one state check per
  // click.
  document.addEventListener("pointerdown", wake, { passive: true });
  document.addEventListener("keydown", wake);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") wake();
  });
}

export function isMuted() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(MUTE_KEY) === "1";
}

export function setMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

/**
 * One note. `frequency` in Hz, `at` seconds from now, `duration` in seconds.
 *
 * The gain envelope matters more than the pitch: a tone that starts and stops
 * abruptly clicks, because the waveform jumps to and from zero. Ramping up
 * over a few milliseconds and decaying exponentially is what makes it read as
 * a chime rather than a beep.
 */
function note(ctx: AudioContext, frequency: number, at: number, duration: number, peak: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.value = frequency;

  const start = ctx.currentTime + at;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function play(build: (ctx: AudioContext) => void) {
  if (isMuted()) return;
  const ctx = audio();
  if (!ctx) return;

  const run = () => {
    try {
      build(ctx);
    } catch {
      /* a cue is never worth surfacing an error for */
    }
  };

  // Should be rare now that any click wakes the context, but a first cue can
  // still arrive before the visitor has touched anything. Resuming here costs
  // real latency — half a second, measured — so it is the fallback, not the
  // path: better a late sound than none.
  if (ctx.state === "suspended") {
    ctx.resume().then(run).catch(() => {});
    return;
  }
  run();
}

/**
 * Someone arrived: a pop.
 *
 * A pitch that falls fast under a very short envelope — 880Hz down to 220Hz
 * inside 70ms — is what the ear hears as a bubble bursting rather than as a
 * note being played. Two things make it work: the attack has to be almost
 * instant, since a slow one turns the same pitch drop into a slide whistle,
 * and the whole thing has to be over in under a tenth of a second.
 *
 * It replaced a two-note chime for a reason beyond taste. The chime ran 350ms
 * against a visual that peaks around 200ms, and a sound that long against a
 * movement that short reads as *nearly* together no matter how precisely both
 * are triggered. A 90ms transient has nowhere to drift.
 */
export function playPop() {
  play((ctx) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = ctx.currentTime;

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, start);
    osc.frequency.exponentialRampToValueAtTime(220, start + 0.07);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.16, start + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09);

    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.12);
  });
}

/** A new notification: one soft ping, deliberately plainer than the join cue. */
export function playNotificationPing() {
  play((ctx) => {
    note(ctx, 784, 0, 0.16, 0.05); // G5
  });
}
