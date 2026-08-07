import Link from "next/link";

import { Logo, Wordmark } from "@/components/brand";
import { APP_TAGLINE } from "@/lib/constants";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="tf-dots absolute inset-0 opacity-50" aria-hidden="true" />
      <div
        className="absolute left-1/2 top-1/4 -z-0 size-[28rem] -translate-x-1/2 rounded-full bg-primary/15 blur-[110px]"
        aria-hidden="true"
      />
      <div className="relative flex w-full flex-col items-center gap-6">
        <Link href="/" className="flex items-center gap-2">
          <Logo />
          <Wordmark className="text-lg" />
        </Link>
        <p className="-mt-3 text-sm text-muted-foreground">{APP_TAGLINE}</p>
        {children}
      </div>
    </div>
  );
}
