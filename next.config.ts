import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `standalone` produces a self-contained .next/standalone bundle that runs with
  // `node server.js` — this is what the Hostinger VPS deploy script ships.
  output: "standalone",
  poweredByHeader: false,
  // No `remotePatterns`, deliberately. Nothing in the app uses `next/image` —
  // avatars render through Radix, which emits a plain `<img>` — but listing a
  // host here leaves `/_next/image` willing to fetch and re-encode pictures
  // from it, and that endpoint sits outside the middleware matcher, so it
  // answers without a session. The bundled `sharp` carries known libvips
  // CVEs (npm audit, high), and Clerk avatars are uploaded by users, so an
  // allowed host is not the same as a trusted image. With the list empty the
  // optimiser refuses every remote URL and the decoder is never reached.
  // Restore this only alongside a `sharp` that has the fixes.
  experimental: {
    // Board reorder payloads are a few hundred KB; attachment uploads travel
    // through a Server Action too, so this has to clear MAX_ATTACHMENT_BYTES
    // (10 MB) with room for the multipart envelope.
    serverActions: {
      bodySizeLimit: "12mb",
    },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
