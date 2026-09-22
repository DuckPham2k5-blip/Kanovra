"use client";

import { useUser } from "@clerk/nextjs";
import { BadgeCheck, Camera, Loader2, User } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { SettingsCard } from "@/components/settings/settings-ui";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { initials } from "@/lib/utils";

const BIO_LIMIT = 160;

export function ProfileCard() {
  const { user, isLoaded } = useUser();
  const router = useRouter();
  const fileRef = React.useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [bio, setBio] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);

  // Seed the fields from Clerk once it has loaded. Kept in local state so the
  // inputs are editable; saved back to Clerk on demand.
  React.useEffect(() => {
    if (!user) return;
    setFullName(user.fullName ?? "");
    setUsername(user.username ?? "");
    setBio((user.unsafeMetadata?.bio as string | undefined) ?? "");
  }, [user]);

  const email = user?.primaryEmailAddress?.emailAddress ?? "";
  const verified =
    user?.primaryEmailAddress?.verification?.status === "verified";

  const dirty =
    isLoaded &&
    user != null &&
    (fullName.trim() !== (user.fullName ?? "") ||
      username.trim() !== (user.username ?? "") ||
      bio !== ((user.unsafeMetadata?.bio as string | undefined) ?? ""));

  async function save() {
    if (!user || saving) return;
    setSaving(true);
    try {
      const trimmed = fullName.trim();
      const [firstName, ...rest] = trimmed.split(/\s+/);
      const lastName = rest.join(" ");

      await user.update({
        firstName: firstName ?? "",
        lastName,
        // Username is only accepted when the Clerk instance enables it; the
        // catch below turns a rejection into a message rather than a crash.
        ...(username.trim() && username.trim() !== user.username
          ? { username: username.trim() }
          : {}),
        unsafeMetadata: { ...user.unsafeMetadata, bio },
      });
      // The app re-syncs name and avatar from Clerk on the next server request
      // (see auth.ts), so refresh makes the change visible everywhere.
      router.refresh();
      toast.success("Profile updated");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not save your profile.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function onPickAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !user) return;
    setUploading(true);
    try {
      await user.setProfileImage({ file });
      router.refresh();
      toast.success("Photo updated");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not update your photo.";
      toast.error(message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <SettingsCard
      id="account"
      icon={User}
      title="Profile Information"
      description="Update your personal details and how others see you."
      action={
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Save changes
        </Button>
      }
    >
      <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative">
            <Avatar className="size-20 ring-2 ring-primary/30 ring-offset-2 ring-offset-background">
              <AvatarImage src={user?.imageUrl} alt={user?.fullName ?? "You"} />
              <AvatarFallback>{initials(user?.fullName ?? email ?? "?")}</AvatarFallback>
            </Avatar>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Change photo"
              className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow ring-2 ring-background transition-transform hover:scale-105 disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Camera className="size-3.5" />
              )}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickAvatar}
            />
          </div>
          <p className="text-center text-[11px] text-muted-foreground">JPG, PNG.<br />Max 5&nbsp;MB.</p>
        </div>

        {/* Fields */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">Full name</Label>
            <Input
              id="profile-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Your name"
              disabled={!isLoaded}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-email">Email address</Label>
            <div className="relative">
              <Input
                id="profile-email"
                value={email}
                readOnly
                className="pr-24 text-muted-foreground"
              />
              {verified ? (
                <Badge
                  variant="secondary"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 gap-1 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                >
                  <BadgeCheck className="size-3" /> Verified
                </Badge>
              ) : null}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-username">Username</Label>
            <Input
              id="profile-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@username"
              disabled={!isLoaded}
            />
            <p className="text-[11px] text-muted-foreground">This is your public username.</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-bio">Bio</Label>
            <Textarea
              id="profile-bio"
              value={bio}
              maxLength={BIO_LIMIT}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Build. Organize. Achieve."
              className="min-h-[76px] resize-none"
              disabled={!isLoaded}
            />
            <p className="text-right text-[11px] text-muted-foreground">
              {bio.length}/{BIO_LIMIT}
            </p>
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}
