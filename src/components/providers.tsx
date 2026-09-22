"use client";

import { ThemeProvider } from "next-themes";

import { RegionProvider } from "@/components/settings/region-provider";
import { PreferencesProvider } from "@/components/settings/use-preferences";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { DateFormatKey } from "@/lib/region";

/**
 * Client-side providers mounted once in the root layout.
 * `ClerkProvider` stays in the layout itself so it can wrap the <html> element.
 * `dateFormat` is read from the cookie by the server layout and passed in, so
 * the region formatters render the same on the server and the client.
 */
export function Providers({
  children,
  dateFormat,
}: {
  children: React.ReactNode;
  dateFormat: DateFormatKey;
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
        <RegionProvider initial={dateFormat}>
          <TooltipProvider delayDuration={200} skipDelayDuration={300}>
            {children}
            <Toaster />
          </TooltipProvider>
        </RegionProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
