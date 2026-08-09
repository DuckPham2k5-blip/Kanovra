"use client";

import { useRouter, useSearchParams } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MemberDTO } from "@/types";

const ALL = "__all__";

/** Project / assignee filters for the workspace calendar, stored in the URL. */
export function CalendarFilters({
  projects,
  members,
  projectId,
  assigneeId,
}: {
  projects: { id: string; name: string }[];
  members: MemberDTO[];
  projectId?: string;
  assigneeId?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === ALL) params.delete(key);
    else params.set(key, value);
    params.delete("task");
    router.push(`?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Select value={projectId ?? ALL} onValueChange={(v) => setParam("project", v)}>
        <SelectTrigger className="w-auto min-w-40">
          <SelectValue placeholder="All projects" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>All projects</SelectItem>
          {projects.map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={assigneeId ?? ALL} onValueChange={(v) => setParam("assignee", v)}>
        <SelectTrigger className="w-auto min-w-40">
          <SelectValue placeholder="Everyone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Everyone</SelectItem>
          {members.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
