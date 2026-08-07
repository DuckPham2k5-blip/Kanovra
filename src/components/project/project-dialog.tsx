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
import { createProject, updateProject } from "@/server/actions/project";

const formSchema = projectCreateSchema.omit({ workspaceId: true });
type FormValues = z.infer<typeof formSchema>;

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
    });
  }, [open, project, form]);

  const color = form.watch("color");
  const icon = form.watch("icon");
  const status = form.watch("status");

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

      toast.success(isEdit ? "Đã cập nhật dự án." : "Đã tạo dự án.");
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
          <DialogTitle>{isEdit ? "Chỉnh sửa dự án" : "Tạo dự án mới"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Cập nhật thông tin hiển thị và trạng thái của dự án."
              : "Dự án mới sẽ có sẵn 5 cột Kanban mặc định."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="p-name">Tên dự án</Label>
            <Input id="p-name" placeholder="VD: Nền tảng Web" autoFocus {...form.register("name")} />
            {form.formState.errors.name ? (
              <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
            ) : null}
          </div>

          {!isEdit ? (
            <div className="space-y-2">
              <Label htmlFor="p-key">
                Mã dự án <span className="font-normal text-muted-foreground">(tuỳ chọn)</span>
              </Label>
              <Input
                id="p-key"
                placeholder="WEB"
                maxLength={6}
                className="font-mono uppercase"
                {...form.register("key")}
              />
              <p className="text-xs text-muted-foreground">
                Dùng để đánh số công việc, ví dụ <span className="font-mono">WEB-42</span>. Bỏ trống
                để hệ thống tự tạo.
              </p>
              {form.formState.errors.key ? (
                <p className="text-xs text-destructive">{form.formState.errors.key.message}</p>
              ) : null}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="p-desc">Mô tả</Label>
            <Textarea id="p-desc" rows={3} placeholder="Dự án này giải quyết điều gì?" {...form.register("description")} />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Trạng thái</Label>
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
              <Label htmlFor="p-due">Hạn hoàn thành</Label>
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
            <Label>Màu</Label>
            <ColorPicker value={color} onChange={(c) => form.setValue("color", c)} />
          </div>

          <div className="space-y-2">
            <Label>Biểu tượng</Label>
            <IconPicker value={icon} onChange={(i) => form.setValue("icon", i)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Huỷ
            </Button>
            <Button type="submit" loading={pending}>
              {isEdit ? "Lưu thay đổi" : "Tạo dự án"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
