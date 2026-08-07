"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_PROJECTS = "all";

/**
 * Writes the analytics filters into the URL so the page itself can stay a
 * Server Component and re-query on navigation.
 */
export function AnalyticsFilters({
  days,
  ranges,
  projects,
  projectId,
}: {
  days: number;
  ranges: number[];
  projects: { id: string; name: string; color?: string }[];
  projectId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === null) params.delete(key);
    else params.set(key, value);

    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <div className="flex items-center gap-2" aria-busy={pending}>
      <Select
        value={projectId ?? ALL_PROJECTS}
        onValueChange={(v) => setParam("project", v === ALL_PROJECTS ? null : v)}
      >
        <SelectTrigger className="w-[10.5rem]" aria-label="Lọc theo dự án">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_PROJECTS}>Tất cả dự án</SelectItem>
          {projects.map((project) => (
            <SelectItem key={project.id} value={project.id}>
              <span className="flex items-center gap-2">
                {project.color ? (
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color }}
                  />
                ) : null}
                <span className="truncate">{project.name}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={String(days)} onValueChange={(v) => setParam("days", v)}>
        <SelectTrigger className="w-[7.5rem]" aria-label="Khoảng thời gian">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ranges.map((range) => (
            <SelectItem key={range} value={String(range)}>
              {range} ngày
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
