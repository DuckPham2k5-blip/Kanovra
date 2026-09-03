"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ProjectStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";

import { ColorPicker } from "@/components/color-picker";
import { IconPicker } from "@/components/icon-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PROJECT_STATUS_META } from "@/lib/constants";
import { projectCreateSchema } from "@/lib/validations";
import {
  BLANK_TEMPLATE_ID,
  PROJECT_TEMPLATES,
  templateById,
  type ProjectTemplate,
} from "@/lib/project-templates";
import { createProject, updateProject } from "@/server/actions/project";

const formSchema = projectCreateSchema.omit({ workspaceId: true });
type FormValues = z.infer<typeof formSchema>;

/**
 * The line under the picker: what this preset will actually create.
 *
 * Counts rather than a list, because the list is the board itself and somebody
 * about to press Create wants to know the size of what they are agreeing to —
 * "5 columns, 4 labels, 3 tasks" is checkable a minute later, and a prose
 * description alone is not. Zero counts are dropped, or the blank template
 * reads "0 labels · 0 tasks", which is noise dressed as information.
 */
function templateSummary(template: ProjectTemplate): string {
  const parts = [
    `${template.columns.length} columns`,
    template.labels.length ? `${template.labels.length} labels` : null,
    template.tasks.length
      ? `${template.tasks.length} ${template.tasks.length === 1 ? "task" : "tasks"}`
      : null,
  ].filter(Boolean);
  return `${template.description} · ${parts.join(" · ")}`;
}

export type ProjectDialogDefaults = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  icon: string;
  status: ProjectStatus;
  startDate: string | null;
  dueDate: string | null;
};

/** Create/edit dialog for a project. Pass `project` to switch to edit mode. */
export function ProjectDialog({
  open,
  onOpenChange,
  workspaceId,
  workspaceSlug,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  workspaceSlug: string;
  project?: ProjectDialogDefaults;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const isEdit = Boolean(project);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      key: "",
      description: "",
      color: "#6366f1",
      icon: "Rocket",
      status: ProjectStatus.ACTIVE,
      startDate: null,
      dueDate: null,
      templateId: BLANK_TEMPLATE_ID,
    },
  });

  // Refill the form each time the dialog opens so stale values never leak in.
  React.useEffect(() => {
    if (!open) return;
    form.reset({
      name: project?.name ?? "",
      key: "",
      description: project?.description ?? "",
      color: project?.color ?? "#6366f1",
      icon: project?.icon ?? "Rocket",
      status: project?.status ?? ProjectStatus.ACTIVE,
      startDate: project?.startDate ? new Date(project.startDate) : null,
      dueDate: project?.dueDate ? new Date(project.dueDate) : null,
      templateId: BLANK_TEMPLATE_ID,
    });
  }, [open, project, form]);

  const color = form.watch("color");
  const icon = form.watch("icon");
  const status = form.watch("status");
  const templateId = form.watch("templateId");

  async function onSubmit(values: FormValues) {
    setPending(true);
    try {
      const result = isEdit
        ? await updateProject({ ...values, projectId: project!.id })
        : await createProject({ ...values, workspaceId });

      if (!result.success) {
        toast.error(result.error);
        return;
      }

      toast.success(isEdit ? "Project updated." : "Project created.");
      onOpenChange(false);

      if (!isEdit && result.data && "id" in result.data) {
        router.push(`/w/${workspaceSlug}/projects/${result.data.id}/board`);
      }
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit project" : "New project"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update how the project appears and where it stands."
              : "New projects start with five default Kanban columns."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="p-name">Project name</Label>
            <Input id="p-name" placeholder="e.g. Web Platform" autoFocus {...form.register("name")} />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          {!isEdit ? (
            <div className="space-y-2">
              <Label htmlFor="p-key">
                Project key <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="p-key"
                placeholder="WEB"
                maxLength={6}
                className="font-mono uppercase"
                {...form.register("key")}
              />
              <p className="text-xs text-muted-foreground">
                Used to number tasks, e.g. <span className="font-mono">WEB-42</span>. Leave blank
                and one is generated.
              </p>
              {form.formState.errors.key ? (
                <p className="text-xs text-destructive">{form.formState.errors.key.message}</p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="p-desc">Description</Label>
            <Textarea id="p-desc" rows={3} placeholder="What problem does this project solve?" {...form.register("description")} />
          </div>

          {/* Creation only. A template fills a board that does not exist yet;
              offering it on an edit would imply it can restructure a board
              people are already working on, which it deliberately cannot. */}
          {!isEdit ? (
            <div className="space-y-2">
              <Label>Start from</Label>
              <Select
                value={templateId ?? BLANK_TEMPLATE_ID}
                onValueChange={(v) => form.setValue("templateId", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROJECT_TEMPLATES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {templateSummary(templateById(templateId))}
              </p>
            </div>
          ) : null}

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={status}
                onValueChange={(v) => form.setValue("status", v as ProjectStatus)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PROJECT_STATUS_META).map(([value, meta]) => (
                    <SelectItem key={value} value={value}>
                      {meta.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="p-due">Due date</Label>
              <Input
                id="p-due"
                type="date"
                value={
                  form.watch("dueDate")
                    ? new Date(form.watch("dueDate") as Date).toISOString().slice(0, 10)
                    : ""
                }
                onChange={(e) =>
                  form.setValue("dueDate", e.target.value ? new Date(e.target.value) : null)
                }
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Colour</Label>
            <ColorPicker value={color} onChange={(c) => form.setValue("color", c)} />
          </div>

          <div className="space-y-2">
            <Label>Icon</Label>
            <IconPicker value={icon} onChange={(i) => form.setValue("icon", i)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending}>
              {isEdit ? "Save changes" : "New project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
