"use client";

import { Check, ImageOff, Link2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BANNER_PRESETS, MAX_BANNER_BYTES } from "@/lib/project-banners";
import { cn } from "@/lib/utils";
import { setProjectBanner } from "@/server/actions/project";

/**
 * Picks the backdrop for a project header: one of the built-in gradients, a
 * picture of your own, or nothing.
 *
 * The two routes are presented as one list with the upload at the end rather
 * than as separate tabs, because they answer the same question and only one of
 * them can be in effect at a time.
 */
export function ProjectBannerDialog({
  open,
  onOpenChange,
  projectId,
  theme,
  currentPreset,
  hasImage,
  imageUrl,
  positionY,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Which theme's backdrop is being set — the header opens this in its own. */
  theme: "light" | "dark";
  currentPreset: string | null;
  hasImage: boolean;
  imageUrl: string | null;
  positionY: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement>(null);

  // Local while dragging, saved on release. Writing on every step of a slider
  // would be one request per pixel of travel.
  const [framing, setFraming] = React.useState(positionY);
  React.useEffect(() => setFraming(positionY), [positionY, open]);

  const [link, setLink] = React.useState("");

  /**
   * `keepOpen` is for the framing slider: choosing a backdrop is finished when
   * you have chosen one, but framing is adjusted by eye and closing the dialog
   * on every release would make it unusable.
   */
  async function submit(build: (form: FormData) => void, done: string, keepOpen = false) {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("projectId", projectId);
      // The theme this backdrop belongs to. The server writes only that theme's
      // columns, so the other theme's choice is left untouched.
      form.set("theme", theme);
      build(form);

      const result = await setProjectBanner(form);
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      toast.success(done);
      router.refresh();
      if (!keepOpen) onOpenChange(false);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function onFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Checked here as well as on the server. The server is what enforces it;
    // this only saves the visitor from uploading four megabytes to be told no.
    if (file.size > MAX_BANNER_BYTES) {
      toast.error(
        `That picture is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${MAX_BANNER_BYTES / 1024 / 1024} MB.`,
      );
      event.target.value = "";
      return;
    }

    void submit(
      (form) => {
        form.set("mode", "upload");
        form.set("file", file);
      },
      "Backdrop updated.",
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Project backdrop</DialogTitle>
          <DialogDescription>
            Sits behind the project title. Everyone on the project sees it. You are setting the{" "}
            <span className="font-medium text-foreground">{theme} mode</span> backdrop — the other
            theme keeps its own, so switch themes to give each a different one.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2">
          {BANNER_PRESETS.map((preset) => {
            const active = !hasImage && currentPreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                disabled={busy}
                onClick={() =>
                  void submit((form) => {
                    form.set("mode", "preset");
                    form.set("preset", preset.id);
                  }, `Backdrop set to ${preset.label}.`)
                }
                className={cn(
                  "relative h-16 overflow-hidden rounded-lg border transition-transform",
                  "hover:scale-[1.02] disabled:opacity-60",
                  active ? "border-primary ring-2 ring-primary/40" : "border-border",
                )}
                style={{ background: preset.css }}
                aria-label={preset.label}
              >
                {active ? (
                  <Check className="absolute right-1.5 top-1.5 size-4 text-white drop-shadow" />
                ) : null}
                <span className="absolute bottom-1 left-2 text-[11px] font-medium text-white/90 drop-shadow">
                  {preset.label}
                </span>
              </button>
            );
          })}
        </div>

        <div className="space-y-2">
          <label htmlFor="tf-banner-link" className="text-sm font-medium">
            Or link to a picture or GIF
          </label>
          <div className="flex gap-2">
            <Input
              id="tf-banner-link"
              placeholder="https://example.com/banner.gif"
              value={link}
              disabled={busy}
              onChange={(event) => setLink(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || !link.trim()) return;
                event.preventDefault();
                void submit((form) => {
                  form.set("mode", "link");
                  form.set("url", link.trim());
                }, "Backdrop linked.");
              }}
            />
            <Button
              variant="outline"
              disabled={busy || !link.trim()}
              onClick={() =>
                void submit((form) => {
                  form.set("mode", "link");
                  form.set("url", link.trim());
                }, "Backdrop linked.")
              }
            >
              <Link2 className="size-4" /> Use
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Loaded straight from that address by everyone who opens the project, so the
            site hosting it can see who is looking — and can change or remove the picture
            at any time. Must be https.
          </p>
        </div>

        {imageUrl ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="tf-banner-framing" className="text-sm font-medium">
                Framing
              </label>
              <span className="text-xs text-muted-foreground">{framing}%</span>
            </div>

            {/* The preview is the same aspect and the same crop rule as the real
                header, so what is dragged here is what appears there. */}
            <div
              className="h-20 rounded-lg border bg-cover"
              style={{
                backgroundImage: `url("${imageUrl}")`,
                backgroundPosition: `center ${framing}%`,
              }}
            />

            <input
              id="tf-banner-framing"
              type="range"
              min={0}
              max={100}
              value={framing}
              disabled={busy}
              className="w-full accent-primary"
              onChange={(event) => setFraming(Number(event.target.value))}
              onPointerUp={() =>
                void submit(
                  (form) => {
                    form.set("mode", "position");
                    form.set("positionY", String(framing));
                  },
                  "Framing saved.",
                  true,
                )
              }
              onKeyUp={() =>
                void submit(
                  (form) => {
                    form.set("mode", "position");
                    form.set("positionY", String(framing));
                  },
                  "Framing saved.",
                  true,
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              A header is much wider than it is tall, so a picture is always cropped top
              and bottom. This chooses which band to keep.
            </p>
          </div>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          className="hidden"
          onChange={onFile}
        />

        <DialogFooter className="sm:justify-between">
          <Button
            variant="ghost"
            disabled={busy || (!hasImage && !currentPreset)}
            onClick={() => void submit((form) => form.set("mode", "clear"), "Backdrop removed.")}
          >
            <ImageOff className="size-4" /> Remove
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload className="size-4" />
            {hasImage ? "Replace picture" : "Upload a picture"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
