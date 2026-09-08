"use client";

import { Check, Copy, Globe, RefreshCw, ShieldOff } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatDate } from "@/lib/date";
import { SHARE_EXPIRY_CHOICES, shareUrl, type ShareExpiryChoice } from "@/lib/share-link";
import { createShareLink, revokeShareLink } from "@/server/actions/share";

export type ShareLinkState = {
  token: string;
  createdAt: string;
  expiresAt: string | null;
  lastViewedAt: string | null;
  createdByName: string;
} | null;

/**
 * Publishing a board, and taking it back down.
 *
 * ## It says what it does before it does it
 *
 * Every other sharing control in this application moves something between
 * people who are already in the workspace. This one puts a board on the open
 * internet, so the dialog states the consequence in the sentence above the
 * button rather than in a tooltip after it — and states the part that cannot be
 * undone, which is that an address, once sent, is out of anybody's hands.
 *
 * ## The link is built in the browser
 *
 * From `window.location.origin`, not from a server-side environment variable.
 * `NEXT_PUBLIC_APP_URL` is one deploy step away from being wrong, and a share
 * dialog that hands somebody a link to the wrong hostname fails in the most
 * expensive way available: silently, in a message already sent to a client.
 * The origin the person is looking at is the origin that works.
 *
 * Read in an effect rather than during render, because the server has no
 * `window` and the two must not disagree at hydration.
 */
export function ShareDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  link,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  projectName: string;
  link: ShareLinkState;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [expiry, setExpiry] = React.useState<ShareExpiryChoice>("30d");
  const [copied, setCopied] = React.useState(false);
  const [confirmReplace, setConfirmReplace] = React.useState(false);
  const [confirmRevoke, setConfirmRevoke] = React.useState(false);

  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = link && origin ? shareUrl(origin, link.token) : "";

  async function handleCreate() {
    setPending(true);
    const result = await createShareLink({ projectId, expiry });
    setPending(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setConfirmReplace(false);
    toast.success(link ? "New link created. The old one no longer works." : "Board published.");
    router.refresh();
  }

  async function handleRevoke() {
    setPending(true);
    const result = await revokeShareLink({ projectId });
    setPending(false);
    if (!result.success) {
      toast.error(result.error);
      return;
    }
    setConfirmRevoke(false);
    toast.success("The link no longer works.");
    router.refresh();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access is refused outside a secure context and in some
      // embedded browsers. The address is in a focusable field either way, so
      // say what to do rather than failing with nothing to show for it.
      toast.error("Could not copy. Select the link and copy it by hand.");
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Globe className="size-4" />
              Share this board
            </DialogTitle>
            <DialogDescription>
              {link
                ? "Anyone with this link can see the board without signing in."
                : `Publish ${projectName} as a read-only board that anyone with the link can open — no account needed.`}
            </DialogDescription>
          </DialogHeader>

          {/*
            The expiry control is outside the two branches on purpose. It was
            inside the "no link yet" half at first, which meant pressing "New
            link" on an existing one silently minted a 30-day link whatever the
            person had chosen before — a default applied to a decision they
            thought they were making. The wording is future tense in both
            states, because it never describes the link that already exists;
            that one reports its own end date in the list below.
          */}
          <div className="space-y-1.5">
            <label htmlFor="share-expiry" className="text-sm font-medium">
              {link ? "A new link would last" : "How long should it last?"}
            </label>
            <Select value={expiry} onValueChange={(v) => setExpiry(v as ShareExpiryChoice)}>
              <SelectTrigger id="share-expiry">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SHARE_EXPIRY_CHOICES.map((choice) => (
                  <SelectItem key={choice.value} value={choice.value}>
                    {choice.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {link ? (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="font-mono text-xs"
                  aria-label="Public link"
                />
                <Button variant="outline" onClick={() => void handleCopy()} disabled={!url}>
                  {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>

              <dl className="grid gap-1 text-xs text-muted-foreground">
                <div className="flex justify-between gap-4">
                  <dt>Published by</dt>
                  <dd className="text-foreground">
                    {link.createdByName} · {formatDate(link.createdAt)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Stops working</dt>
                  <dd className="text-foreground">
                    {link.expiresAt ? formatDate(link.expiresAt) : "When you turn it off"}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt>Last opened</dt>
                  {/* Never opened and opened-but-not-yet-stamped are the same
                      state for the first hour, so the wording avoids claiming
                      more precision than the field has. */}
                  <dd className="text-foreground">
                    {link.lastViewedAt ? formatDate(link.lastViewedAt) : "Not yet"}
                  </dd>
                </div>
              </dl>

              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                Names and avatars of whoever a task is assigned to are visible on this board.
                Email addresses, comments, attachments and time entries are not.
              </p>

              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() => setConfirmReplace(true)}
                >
                  <RefreshCw className="size-4" />
                  New link
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={pending}
                  onClick={() => setConfirmRevoke(true)}
                >
                  <ShieldOff className="size-4" />
                  Turn off
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                Anyone holding the link can open the board — there is no sign-in and no way to
                tell who has it. You can turn it off at any time, but you cannot take back an
                address somebody has already been sent.
              </p>

              <DialogFooter>
                <Button variant="ghost" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button disabled={pending} onClick={() => void handleCreate()}>
                  <Globe className="size-4" />
                  Create link
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmReplace}
        onOpenChange={setConfirmReplace}
        title="Create a new link?"
        description={`The current address stops working immediately. Anybody you have already sent it to will need the new one, which lasts ${
          SHARE_EXPIRY_CHOICES.find((c) => c.value === expiry)?.label.toLowerCase() ?? ""
        }.`}
        confirmLabel="Create new link"
        onConfirm={handleCreate}
      />

      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Turn off the public link?"
        description="The board stops being reachable from outside the workspace. You can publish it again later, but it will have a different address."
        confirmLabel="Turn it off"
        destructive
        onConfirm={handleRevoke}
      />
    </>
  );
}
