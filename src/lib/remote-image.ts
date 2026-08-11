import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { BANNER_MIME_TYPES } from "@/lib/project-banners";

/**
 * Checks that a linked address really is a picture before it is saved.
 *
 * Without this the app accepts anything shaped like a URL and reports success,
 * then shows an empty header — which is what happened with a Pinterest share
 * link: a perfectly valid address to an HTML page, saved happily, impossible
 * to render, and no way for the owner to find out why.
 *
 * Fetching a URL the visitor chose means the server can be pointed at
 * addresses the visitor cannot reach themselves — cloud metadata endpoints,
 * databases on the internal network, admin panels bound to localhost. Every
 * hop is therefore resolved to an IP and refused if that IP is private, and
 * redirects are followed by hand so a public host cannot bounce us inward.
 */

const HOP_LIMIT = 3;
const TIMEOUT_MS = 6000;

/**
 * Address ranges that must never be fetched: loopback, link-local (which
 * includes the 169.254.169.254 metadata address used by most cloud providers),
 * and the private IPv4 and IPv6 blocks.
 */
export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true; // not an address at all — refuse rather than guess

  if (family === 4) {
    const [a, b] = address.split(".").map(Number);
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
    if (a >= 224) return true; // multicast and reserved
    return false;
  }

  const ip = address.toLowerCase();
  if (ip === "::" || ip === "::1") return true;
  if (ip.startsWith("fe80")) return true; // link-local
  if (ip.startsWith("fc") || ip.startsWith("fd")) return true; // unique local
  // ::ffff:10.0.0.1 and friends — an IPv4 address wearing an IPv6 coat.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return isPrivateAddress(mapped[1]);
  return false;
}

async function resolvesToPublicAddress(hostname: string): Promise<boolean> {
  // A literal IP never reaches DNS, so check it directly.
  if (isIP(hostname)) return !isPrivateAddress(hostname);
  try {
    const { address } = await lookup(hostname);
    return !isPrivateAddress(address);
  } catch {
    return false;
  }
}

export type RemoteImageResult =
  | { ok: true; mime: string }
  | { ok: false; reason: string };

export async function verifyRemoteImage(startUrl: string): Promise<RemoteImageResult> {
  let url = startUrl;

  for (let hop = 0; hop < HOP_LIMIT; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return { ok: false, reason: "That address could not be read." };
    }
    if (parsed.protocol !== "https:") {
      return { ok: false, reason: "The link must start with https://." };
    }
    if (!(await resolvesToPublicAddress(parsed.hostname))) {
      return { ok: false, reason: "That address is not reachable from the internet." };
    }

    let response: Response;
    try {
      response = await fetch(parsed, {
        method: "GET",
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        // Some hosts serve a different body, or none, without one.
        headers: { Accept: "image/*" },
      });
    } catch {
      return { ok: false, reason: "That address did not respond." };
    }

    // Followed by hand: `redirect: "follow"` would let a public host send us
    // to an internal one after the check above had already passed.
    if (response.status >= 300 && response.status < 400) {
      const next = response.headers.get("location");
      if (!next) return { ok: false, reason: "That address did not respond." };
      url = new URL(next, parsed).toString();
      continue;
    }

    if (!response.ok) {
      return { ok: false, reason: `That address answered ${response.status}.` };
    }

    const mime = (response.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!BANNER_MIME_TYPES.has(mime)) {
      return {
        ok: false,
        reason: mime.startsWith("text/")
          ? "That is a link to a web page, not to a picture. Right-click the picture itself and copy its image address."
          : "That link is not a PNG, JPEG, WebP or GIF.",
      };
    }

    return { ok: true, mime };
  }

  return { ok: false, reason: "That address redirects too many times." };
}
