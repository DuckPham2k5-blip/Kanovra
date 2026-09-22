"use client";

import { ThemeProvider } from "next-themes";

import { RegionProvider } from "@/components/settings/region-provider";
import { PreferencesProvider } from "@/components/settings/use-preferences";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { Region } from "@/lib/region";

/**
 * Client-side providers mounted once in the root layout.
 * `ClerkProvider` stays in the layout itself so it can wrap the <html> element.
 * `region` (date format + timezone) is read from the cookie by the server
 * layout and passed in, so the formatters render the same on server and client.
 */
export function Providers({
  children,
  region,
}: {
  children: React.ReactNode;
  region: Region;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="kanovra-theme"
    >
      <PreferencesProvider>
        <RegionProvider initial={region}>
          <TooltipProvider delayDuration={200} skipDelayDuration={300}>
            {children}
            <Toaster />
          </TooltipProvider>
        </RegionProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
