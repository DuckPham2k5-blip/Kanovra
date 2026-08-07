import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { SimpleTooltip } from "@/components/ui/tooltip";
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
        style={user ? { backgroundColor: `${colorFromString(user.id)}22` } : undefined}
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
}: {
  users: AvatarUser[];
  max?: number;
  className?: string;
  size?: string;
}) {
  const visible = users.slice(0, max);
  const overflow = users.length - visible.length;

  return (
    <div className={cn("flex -space-x-2", className)}>
      {visible.map((user) => (
        <UserAvatar key={user.id} user={user} className={cn(size, "ring-2 ring-background")} />
      ))}
      {overflow > 0 ? (
        <SimpleTooltip label={users.slice(max).map((u) => u.name).join(", ")}>
          <span
            className={cn(
              size,
              "flex items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background",
            )}
          >
            +{overflow}
          </span>
        </SimpleTooltip>
      ) : null}
    </div>
  );
}
