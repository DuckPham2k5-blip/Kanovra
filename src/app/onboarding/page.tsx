import { ArrowRight, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Logo, Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { WorkspaceForm } from "@/components/workspace/workspace-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getUserWorkspaces, requireUser } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/permissions";

export const metadata: Metadata = { title: "Get started" };

/**
 * Landing spot after sign-in. Users with exactly one workspace go straight in;
 * users with several pick one; brand-new users create their first.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const user = await requireUser();
  const { new: forceNew } = await searchParams;
  const workspaces = await getUserWorkspaces(user.id);

  if (workspaces.length === 1 && !forceNew) redirect(`/w/${workspaces[0].slug}`);

  const showPicker = workspaces.length > 0 && !forceNew;

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="tf-dots absolute inset-0 opacity-50" aria-hidden="true" />
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <Logo className="size-10" />
          <Wordmark className="text-lg" />
        </div>

        {showPicker ? (
          <Card>
            <CardHeader>
              <CardTitle>Hi {user.name.split(" ").slice(-1)[0]} 👋</CardTitle>
              <CardDescription>Pick a workspace to continue.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {workspaces.map((ws) => (
                <Link
                  key={ws.id}
                  href={`/w/${ws.slug}`}
                  className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:border-primary/50 hover:bg-accent"
                >
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white"
                    style={{ backgroundColor: ws.color }}
                  >
                    {ws.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{ws.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {ROLE_LABEL[ws.role]} · {ws._count.members} members ·{" "}
                      {ws._count.projects} projects
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}

              <Button variant="outline" className="w-full" asChild>
                <Link href="/onboarding?new=1">
                  <Plus /> New workspace
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>
                {workspaces.length > 0 ? "New workspace" : "Create your first workspace"}
              </CardTitle>
              <CardDescription>
                Each workspace is a team. Invite members and create projects right after.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WorkspaceForm />
              {workspaces.length > 0 ? (
                <Button variant="ghost" className="mt-3 w-full" asChild>
                  <Link href="/onboarding">Back to the list</Link>
                </Button>
              ) : null}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
