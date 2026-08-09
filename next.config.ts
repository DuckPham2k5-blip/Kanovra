import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `standalone` produces a self-contained .next/standalone bundle that runs with
  // `node server.js` — this is what the Hostinger VPS deploy script ships.
  output: "standalone",
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "images.clerk.dev" },
      { protocol: "https", hostname: "www.gravatar.com" },
    ],
  },
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
