"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { ColorPicker } from "@/components/color-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { updateWorkspace } from "@/server/actions/workspace";

type Workspace = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string;
};

export function WorkspaceSettingsForm({
  workspace,
  canEdit,
}: {
  workspace: Workspace;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [name, setName] = React.useState(workspace.name);
  const [description, setDescription] = React.useState(workspace.description ?? "");
  const [color, setColor] = React.useState(workspace.color);

  const dirty =
    name !== workspace.name ||
    description !== (workspace.description ?? "") ||
    color !== workspace.color;

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      toast.error("Name must be at least 2 characters.");
      return;
    }

    startTransition(async () => {
      const result = await updateWorkspace({
        workspaceId: workspace.id,
        name: name.trim(),
        description,
        color,
      });

      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success("Changes saved.");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="ws-name">Name</Label>
        <Input
          id="ws-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          disabled={!canEdit || pending}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="ws-description">Description</Label>
        <Textarea
          id="ws-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={280}
          rows={3}
          placeholder="What does this team do?"
          disabled={!canEdit || pending}
        />
      </div>

      <div className="space-y-2">
        <Label>Accent colour</Label>
        {canEdit ? (
          <ColorPicker value={color} onChange={setColor} />
        ) : (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-5 rounded-full" style={{ backgroundColor: color }} />
            {color}
          </div>
        )}
      </div>

      {canEdit ? (
        <div className="flex items-center gap-3">
          <Button type="submit" loading={pending} disabled={!dirty}>
            Save changes
          </Button>
          {dirty ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => {
                setName(workspace.name);
                setDescription(workspace.description ?? "");
                setColor(workspace.color);
              }}
            >
              Undo
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          You need the Admin role or higher to make changes.
        </p>
      )}
    </form>
  );
}
