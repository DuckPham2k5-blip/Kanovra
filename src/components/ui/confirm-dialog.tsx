"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
};

/**
 * Destructive-action confirmation. Keeps its own pending state so callers can
 * simply `await` their server action inside `onConfirm`.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Xác nhận",
  cancelLabel = "Huỷ",
  destructive,
  onConfirm,
}: ConfirmDialogProps) {
  const [pending, setPending] = React.useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (pending ? null : onOpenChange(v))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            loading={pending}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Hook wrapper so a page can render one dialog and trigger it imperatively. */
export function useConfirm() {
  const [state, setState] = React.useState<
    (Omit<ConfirmDialogProps, "open" | "onOpenChange"> & { open: boolean }) | null
  >(null);

  const confirm = React.useCallback(
    (options: Omit<ConfirmDialogProps, "open" | "onOpenChange">) =>
      setState({ ...options, open: true }),
    [],
  );

  const dialog = state ? (
    <ConfirmDialog
      {...state}
      onOpenChange={(open) => setState((s) => (s ? { ...s, open } : null))}
    />
  ) : null;

  return { confirm, dialog };
}
