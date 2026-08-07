import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** `Nguyễn Hải An` → `NA`. Falls back to the first character of an email. */
export function initials(name?: string | null, fallback = "?") {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return fallback;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Written with escapes rather than literal characters so the source stays ASCII.
/** Combining diacritics left behind by NFD normalisation. */
const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");
/** Vietnamese `đ`/`Đ`, which NFD does not decompose. */
const D_STROKE = new RegExp("[\\u0111\\u0110]", "g");

/** Strips Vietnamese diacritics so text can be slugified or keyed. */
export function deaccent(input: string) {
  return input.normalize("NFD").replace(COMBINING_MARKS, "").replace(D_STROKE, (m) =>
    m === "Đ" ? "D" : "d",
  );
}

/** URL-safe slug that keeps Vietnamese words readable. */
export function slugify(input: string) {
  return deaccent(input)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** Derives a project key like `WEB` from a project name. */
export function projectKeyFromName(name: string) {
  const words = deaccent(name)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "PRJ";
  if (words.length === 1) return words[0].slice(0, 4);
  return words
    .slice(0, 3)
    .map((w) => w[0])
    .join("");
}

/**
 * Fractional index between two neighbours. Passing `null` means "at the edge".
 * Keeps drag & drop reordering to a single row update in the common case.
 */
export function orderBetween(before: number | null, after: number | null) {
  if (before == null && after == null) return 1000;
  if (before == null) return (after as number) / 2;
  if (after == null) return before + 1000;
  return (before + after) / 2;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function percent(part: number, total: number) {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

/** Groups an array by a key selector, preserving insertion order. */
export function groupBy<T, K extends string | number>(items: T[], key: (item: T) => K) {
  return items.reduce(
    (acc, item) => {
      const k = key(item);
      (acc[k] ??= []).push(item);
      return acc;
    },
    {} as Record<K, T[]>,
  );
}

/** Deterministic pleasant colour from any string — used for avatar fallbacks. */
export function colorFromString(input: string) {
  const palette = [
    "#6366f1",
    "#8b5cf6",
    "#ec4899",
    "#f43f5e",
    "#f59e0b",
    "#10b981",
    "#14b8a6",
    "#0ea5e9",
  ];
  let hash = 0;
  for (let i = 0; i < input.length; i++) hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  return palette[hash % palette.length];
}

/** Small helper for building `?task=…` style links without losing other params. */
export function withParam(pathname: string, params: Record<string, string | null | undefined>) {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v);
  const qs = search.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}
