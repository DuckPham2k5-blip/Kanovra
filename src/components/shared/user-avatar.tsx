"use client";

import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SimpleTooltip } from "@/components/ui/tooltip";
import { usePresence } from "@/lib/presence";
import { playPop } from "@/lib/sound";
import { cn, colorFromString, initials } from "@/lib/utils";

export type AvatarUser = {
  id: string;
  name: string;
  imageUrl?: string | null;
  email?: string | null;
};

export function UserAvatar({
  user,
  className,
  showTooltip = true,
}: {
  user: AvatarUser | null | undefined;
  className?: string;
  showTooltip?: boolean;
}) {
  const avatar = (
    <Avatar className={cn("size-6", className)}>
      {user?.imageUrl ? <AvatarImage src={user.imageUrl} alt={user.name} /> : null}
      <AvatarFallback
        // Tint over the root's opaque background, so the per-person colour is
        // readable without letting a stacked avatar show through.
        style={user ? { backgroundColor: `${colorFromString(user.id)}33` } : undefined}
      >
        {initials(user?.name)}
      </AvatarFallback>
    </Avatar>
  );

  if (!user || !showTooltip) return avatar;
  return <SimpleTooltip label={user.name}>{avatar}</SimpleTooltip>;
}

/** Overlapping avatars with a `+N` overflow chip. */
export function AvatarStack({
  users,
  max = 4,
  className,
  size = "size-7",
  showPresence = false,
}: {
  users: AvatarUser[];
  max?: number;
  className?: string;
  size?: string;
  /** Ring whoever has the workspace open right now, and chime when they arrive. */
  showPresence?: boolean;
}) {
  const presence = usePresence();

  // Your own ring would be lit permanently and tell you nothing you do not
  // already know, so presence here means *other people*.
  const lit = React.useMemo(() => {
    if (!showPresence) return new Set<string>();
    const set = new Set(presence.online);
    if (presence.you) set.delete(presence.you);
    return set;
  }, [showPresence, presence]);

  const arrived = React.useMemo(() => {
    if (!showPresence) return new Set<string>();
    const set = new Set(presence.arrived);
    if (presence.you) set.delete(presence.you);
    return set;
  }, [showPresence, presence]);

  const left = React.useMemo(() => {
    if (!showPresence) return new Set<string>();
    const set = new Set(presence.left);
    if (presence.you) set.delete(presence.you);
    return set;
  }, [showPresence, presence]);

  // Whoever is online goes to the front. Without this the ring is invisible in
  // exactly the case it matters — a team larger than `max`, where the person
  // who just showed up is the one pushed into the `+N` chip.
  const ordered = React.useMemo(() => {
    if (!lit.size) return users;
    const here = users.filter((u) => lit.has(u.id));
    const away = users.filter((u) => !lit.has(u.id));
    return [...here, ...away];
  }, [users, lit]);

  const visible = ordered.slice(0, max);
  const hidden = ordered.slice(max);
  const overflow = hidden.length;

  // Only people this page can actually show are worth announcing. Both cues
  // ride the same poll that moves the ring, so the sound and the change on
  // screen land together rather than one trailing the other.
  const arrivedHere = [...arrived].filter((id) => users.some((u) => u.id === id)).join(",");
  const leftHere = [...left].filter((id) => users.some((u) => u.id === id)).join(",");

  // Arriving pops; leaving is silent by design. A cue every time somebody
  // closes a tab would make an ordinary afternoon sound like an argument.
  React.useEffect(() => {
    if (arrivedHere) playPop();
  }, [arrivedHere]);

  /**
   * Someone who has just gone still needs to be on screen for a moment: a
   * halo removed the instant presence drops has nothing left to animate, and
   * the ring would simply blink out. These ids are held past their departure
   * for exactly as long as the exit runs, then released.
   */
  const [leaving, setLeaving] = React.useState<ReadonlySet<string>>(new Set());

  React.useEffect(() => {
    if (!leftHere) return;
    const ids = leftHere.split(",");
    setLeaving((prev) => new Set([...prev, ...ids]));

    const timer = setTimeout(() => {
      setLeaving((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      // Must outlast the exit animation in globals.css (520ms) or the element
      // unmounts mid-flight and the ring blinks out instead of collapsing.
    }, 560);

    return () => clearTimeout(timer);
  }, [leftHere]);

  /**
   * The `+N` chip lights when somebody online is folded inside it.
   *
   * Because online people are sorted to the front, that can only happen once
   * more of them are here than there are slots to show them in — so the ring
   * on the chip means "some of the people you cannot see are here right now",
   * and its absence means the hidden ones are all away. Its colour is the
   * route accent rather than any one person's, since it stands for several at
   * once.
   */
  const hiddenOnline = hidden.filter((u) => lit.has(u.id));
  const chipLit = hiddenOnline.length > 0;
  const chipArriving = chipLit && hidden.some((u) => arrived.has(u.id));
  const chipLeaving = !chipLit && hidden.some((u) => leaving.has(u.id));

  return (
    <div className={cn("flex -space-x-2", className)}>
      {visible.map((user) => {
        const here = lit.has(user.id);
        const going = !here && leaving.has(user.id);
        return (
          <span
            key={user.id}
            className={cn("relative inline-flex", (here || going) && "tf-newcomer")}
            data-arriving={arrived.has(user.id) ? "" : undefined}
            data-leaving={going ? "" : undefined}
            // One flat colour per person, drawn from the same palette that
            // tints their avatar — so the ring reads as *their* colour rather
            // than a generic highlight, and two people online at once are told
            // apart at a glance. Falls back to the route accent if the variable
            // is ever missing.
            style={
              here || going
                ? ({ "--tf-newcomer-color": colorFromString(user.id) } as React.CSSProperties)
                : undefined
            }
          >
            {here || going ? <span className="tf-newcomer-halo" aria-hidden="true" /> : null}
            <UserAvatar user={user} className={cn(size, "ring-2 ring-background")} />
            {here ? <span className="sr-only">online now</span> : null}
          </span>
        );
      })}
      {overflow > 0 ? (
        <span
          className={cn("relative inline-flex", (chipLit || chipLeaving) && "tf-newcomer")}
          data-arriving={chipArriving ? "" : undefined}
          data-leaving={chipLeaving ? "" : undefined}
        >
          {chipLit || chipLeaving ? (
            <span className="tf-newcomer-halo" aria-hidden="true" />
          ) : null}
          <SimpleTooltip
            label={hidden
              .map((u) => (lit.has(u.id) ? `${u.name} (online)` : u.name))
              .join(", ")}
          >
            <span
              className={cn(
                size,
                "flex items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-background",
                // Lit, the chip stops being a grey remainder and becomes a
                // count of people who are actually here.
                chipLit
                  ? "bg-accent text-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              +{overflow}
            </span>
          </SimpleTooltip>
        </span>
      ) : null}
    </div>
  );
}
