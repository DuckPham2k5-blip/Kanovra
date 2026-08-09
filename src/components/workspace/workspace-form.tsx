"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { ColorPicker } from "@/components/color-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { workspaceCreateSchema } from "@/lib/validations";
import { createWorkspace, updateWorkspace } from "@/server/actions/workspace";

type FormValues = z.infer<typeof workspaceCreateSchema>;

/**
 * Create/edit form for a workspace. Passing `workspaceId` switches it to edit
 * mode; otherwise it creates and navigates into the new workspace.
 */
export function WorkspaceForm({
  workspaceId,
  defaultValues,
  onDone,
  submitLabel,
}: {
  workspaceId?: string;
  defaultValues?: Partial<FormValues>;
  onDone?: () => void;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(workspaceCreateSchema),
    defaultValues: {
      name: defaultValues?.name ?? "",
      description: defaultValues?.description ?? "",
      color: defaultValues?.color ?? "#6366f1",
    },
  });

  const color = form.watch("color");

  async function onSubmit(values: FormValues) {
    setPending(true);
    try {
      const result = workspaceId
        ? await updateWorkspace({ ...values, workspaceId })
        : await createWorkspace(values);

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(workspaceId ? "Workspace updated." : "Workspace created.");
      onDone?.();

      if (!workspaceId && "slug" in result.data) {
        router.push(`/w/${result.data.slug}`);
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="ws-name">Workspace name</Label>
        <Input
          id="ws-name"
          placeholder="e.g. Acme Product Team"
          autoFocus
          {...form.register("name")}
        />
        {form.formState.errors.name ? (
          <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="ws-desc">Short description</Label>
        <Textarea
          id="ws-desc"
          rows={3}
          placeholder="What is this workspace for?"
          {...form.register("description")}
        />
      </div>

      <div className="space-y-2">
        <Label>Accent colour</Label>
        <ColorPicker value={color} onChange={(c) => form.setValue("color", c)} />
      </div>

      <Button type="submit" loading={pending} className="w-full">
        {submitLabel ?? (workspaceId ? "Save changes" : "Create workspace")}
      </Button>
    </form>
  );
}
