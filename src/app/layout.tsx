import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";

import { APPEARANCE_INIT_SCRIPT } from "@/components/settings/appearance-init";
import { Providers } from "@/components/providers";
import { APP_DESCRIPTION, APP_NAME, APP_TAGLINE } from "@/lib/constants";
import { parseRegionCookie, REGION_COOKIE } from "@/lib/region";

import "./globals.css";

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: {
    default: `${APP_NAME} — ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  openGraph: {
    title: `${APP_NAME} — ${APP_TAGLINE}`,
    description: APP_DESCRIPTION,
    type: "website",
    locale: "en_US",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1020" },
  ],
  width: "device-width",
  initialScale: 1,
};

/**
 * No `localization` prop.
 *
 * It used to pass `enUS`, and that one word cost **60,028 bytes of HTML on every
 * route in the application**. `ClerkProvider` is a client component, so a prop
 * handed to it from this server component is serialised into the flight payload
 * — and `enUS` is Clerk's entire English dictionary, every string for every
 * screen the product has, including screens this application never renders.
 *
 * Measured on a production build, as raw bytes off `fetch` rather than
 * `outerHTML`, which counts what hydration adds and is not what was sent:
 *
 *     /sign-in    78,258 -> 18,230 bytes   (-77%)
 *     /share/…   144,817 -> 84,789 bytes   (-41%)
 *
 * The same 60,028 either way, because it is the same dictionary and the root
 * layout wraps every route. The board that lost 41% of its weight has no Clerk
 * component on it at all.
 *
 * English is what Clerk renders anyway: the prop is an *override*, forwarded to
 * clerk-js at runtime, and clerk-js carries its own English. Verified by
 * comparing the sign-in screen word for word against a capture taken before —
 * title, subtitle, both field labels, both buttons, the footer, and the curly
 * apostrophe in "Don't have an account?" all identical.
 *
 * Restore it only for a language that is not English, and then knowing the cost
 * is paid on every route rather than on the two screens that show a Clerk
 * component.
 */
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const region = parseRegionCookie((await cookies()).get(REGION_COOKIE)?.value);
  return (
    <ClerkProvider>
      <html lang="en" suppressHydrationWarning className={`${sans.variable} ${mono.variable}`}>
        <body>
          {/* Applies stored appearance preferences (accent, background, motion,
              density) before first paint, so switching pages or reloading does
              not flash the defaults first. The theme's own no-flash script,
              injected by next-themes, handles dark/light the same way. */}
          <script dangerouslySetInnerHTML={{ __html: APPEARANCE_INIT_SCRIPT }} />
          <Providers region={region}>{children}</Providers>
        </body>
      </html>
    </ClerkProvider>
  );
}
