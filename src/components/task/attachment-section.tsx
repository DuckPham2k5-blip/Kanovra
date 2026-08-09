"use client";

import { Download, FileText, ImageIcon, Loader2, Paperclip, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { removeAttachment, uploadAttachment } from "@/server/actions/attachment";

type Attachment = { id: string; name: string; url: string; size: number };

/** 1 kB is 1024 here to match what the operating system reports. */
function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function isImage(name: string) {
  return /\.(png|jpe?g|gif|webp)$/i.test(name);
}

export function AttachmentSection({
  taskId,
  attachments,
  canEdit,
}: {
  taskId: string;
  attachments: Attachment[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [removing, setRemoving] = React.useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      // Sequential rather than parallel: each upload is its own Server Action
      // request, and firing a dozen at once just makes them all slower.
      for (const file of Array.from(files)) {
        const data = new FormData();
        data.set("taskId", taskId);
        data.set("file", file);
        const result = await uploadAttachment(data);
        if (!result.success) {
          toast.error(`${file.name}: ${result.error}`);
          break;
        }
      }
      router.refresh();
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleRemove(attachment: Attachment) {
    setRemoving(attachment.id);
    try {
      const result = await removeAttachment({ attachmentId: attachment.id });
      if (!result.success) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Attachments ({attachments.length})</h3>
        {canEdit ? (
          <>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => void handleFiles(e.target.files)}
            />
            <Button
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Paperclip className="size-4" />
              )}
              {uploading ? "Uploading…" : "Attach"}
            </Button>
          </>
        ) : null}
      </div>

      <ul className="space-y-1">
        {attachments.map((attachment) => {
          const Icon = isImage(attachment.name) ? ImageIcon : FileText;
          return (
            <li
              key={attachment.id}
              className="flex items-center gap-2.5 rounded-md border px-3 py-2"
            >
              <Icon className="size-4 shrink-0 text-muted-foreground" />
              <a
                href={attachment.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1 truncate text-sm hover:underline"
              >
                {attachment.name}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">
                {formatSize(attachment.size)}
              </span>
              <a
                href={attachment.url}
                download
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={`Download ${attachment.name}`}
              >
                <Download className="size-4" />
              </a>
              {canEdit ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={removing !== null}
                  onClick={() => void handleRemove(attachment)}
                  aria-label={`Remove ${attachment.name}`}
                >
                  {removing === attachment.id ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Trash2 className="size-4" />
                  )}
                </Button>
              ) : null}
            </li>
          );
        })}

        {attachments.length === 0 ? (
          <li className="text-sm text-muted-foreground">No attachments yet.</li>
        ) : null}
      </ul>
    </section>
  );
}
