"use client";

import type { MindMapType } from "@prisma/client";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { MindMapTypeCard } from "@/components/mind-map/mind-map-type-card";
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
import { MIND_MAP_META, MIND_MAP_ORDER } from "@/lib/mind-maps";
import { createMindMap } from "@/server/actions/mind-map";

/**
 * The eight types as a picker. Choosing the type comes before naming the map,
 * because the type is the decision that matters — it is a choice about how to
 * think about the subject, not a style of drawing.
 */
export function MindMapGallery({
  workspaceSlug,
  workspaceId,
}: {
  workspaceSlug: string;
  workspaceId: string;
}) {
  const router = useRouter();
  const [chosen, setChosen] = React.useState<MindMapType | null>(null);
  const [title, setTitle] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function create() {
    if (!chosen || !title.trim()) return;
    setBusy(true);
    try {
      const result = await createMindMap({
        workspaceId,
        type: chosen,
        title: title.trim(),
      });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      setChosen(null);
      setTitle("");
      router.push(`/w/${workspaceSlug}/maps/${result.data.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {MIND_MAP_ORDER.map((type) => (
          <MindMapTypeCard key={type} type={type} onSelect={setChosen} disabled={busy} />
        ))}
      </div>

      <Dialog open={chosen !== null} onOpenChange={(open) => !open && setChosen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{chosen ? MIND_MAP_META[chosen].label : "New map"}</DialogTitle>
            <DialogDescription>{chosen ? MIND_MAP_META[chosen].question : null}</DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="tf-map-title">What is this map about?</Label>
            <Input
              id="tf-map-title"
              autoFocus
              value={title}
              disabled={busy}
              placeholder="Onboarding flow"
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                void create();
              }}
            />
          </div>

          <DialogFooter>
            <Button variant="ghost" disabled={busy} onClick={() => setChosen(null)}>
              Cancel
            </Button>
            <Button disabled={busy || !title.trim()} onClick={() => void create()}>
              Create map
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
