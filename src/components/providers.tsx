"use client";

import { ThemeProvider } from "next-themes";

import { PreferencesProvider } from "@/components/settings/use-preferences";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Client-side providers mounted once in the root layout.
 * `ClerkProvider` stays in the layout itself so it can wrap the <html> element.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="kanovra-theme"
    >
      <PreferencesProvider>
        <TooltipProvider delayDuration={200} skipDelayDuration={300}>
          {children}
          <Toaster />
        </TooltipProvider>
      </PreferencesProvider>
    </ThemeProvider>
  );
}
