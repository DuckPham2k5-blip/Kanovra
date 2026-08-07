"use client";

import { Plus } from "lucide-react";
import * as React from "react";

import { ProjectDialog } from "@/components/project/project-dialog";
import { Button } from "@/components/ui/button";

/** Small client island so server pages can offer "create project" anywhere. */
export function NewProjectButton({
  workspaceId,
  workspaceSlug,
  variant = "default",
  size = "sm",
  label = "Dự án mới",
}: {
  workspaceId: string;
  workspaceSlug: string;
  variant?: "default" | "outline" | "ghost" | "secondary";
  size?: "default" | "sm" | "lg";
  label?: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        {label}
      </Button>
      <ProjectDialog
        open={open}
        onOpenChange={setOpen}
        workspaceId={workspaceId}
        workspaceSlug={workspaceSlug}
      />
    </>
  );
}
