import { CheckCircle2, Gauge, Timer, TrendingUp } from "lucide-react";
import type { Metadata } from "next";

import {
  AnalyticsCharts,
  type SliceDatum,
  type TrendPoint,
} from "@/components/analytics/analytics-charts";
import { AnalyticsFilters } from "@/components/analytics/analytics-filters";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { requireWorkspace } from "@/lib/auth";
import { PRIORITY_META, PRIORITY_ORDER, TASK_STATUS_META, TASK_STATUS_ORDER } from "@/lib/constants";
import { format, lastNDays } from "@/lib/date";
import { prisma } from "@/lib/prisma";
import { getAnalytics } from "@/lib/queries";

export const metadata: Metadata = { title: "Phân tích" };

const RANGES = [7, 14, 30, 90];

export default async function AnalyticsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ days?: string; project?: string }>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const { workspace } = await requireWorkspace(slug);

  const days = RANGES.includes(Number(query.days)) ? Number(query.days) : 30;

  const [data, projects] = await Promise.all([
    getAnalytics(workspace.id, days, query.project),
    prisma.project.findMany({
      where: { workspaceId: workspace.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Bucket the raw timestamps into one point per day.
  const buckets = new Map<string, TrendPoint>();
  for (const day of lastNDays(days)) {
    const key = format(day, "yyyy-MM-dd");
    buckets.set(key, { date: format(day, "dd/MM"), created: 0, completed: 0 });
  }
  for (const d of data.createdDates) {
    const point = buckets.get(format(new Date(d), "yyyy-MM-dd"));
    if (point) point.created += 1;
  }
  for (const d of data.completedDates) {
    const point = buckets.get(format(new Date(d), "yyyy-MM-dd"));
    if (point) point.completed += 1;
  }
  const trend = Array.from(buckets.values());

  const statusData: SliceDatum[] = TASK_STATUS_ORDER.filter(
    (s) => (data.statusCounts[s] ?? 0) > 0,
  ).map((s) => ({
    name: TASK_STATUS_META[s].label,
    value: data.statusCounts[s] ?? 0,
    color: TASK_STATUS_META[s].color,
  }));

  const priorityData: SliceDatum[] = PRIORITY_ORDER.map((p) => ({
    name: PRIORITY_META[p].label,
    value: data.priorityCounts[p] ?? 0,
    color: PRIORITY_META[p].color,
  }));

  const projectData: SliceDatum[] = data.byProject.slice(0, 8).map((p) => ({
    name: p.name,
    value: p.total,
    color: p.color,
  }));

  const totalCreated = trend.reduce((sum, p) => sum + p.created, 0);
  const totalCompleted = trend.reduce((sum, p) => sum + p.completed, 0);
  const totalTasks = Object.values(data.statusCounts).reduce((a, b) => a + b, 0);
  const doneTotal = data.statusCounts.DONE ?? 0;
  const completionRate = totalTasks ? Math.round((doneTotal / totalTasks) * 100) : 0;

  return (
    <div>
      <PageHeader
        title="Phân tích"
        description={`Số liệu ${days} ngày gần nhất của ${workspace.name}.`}
        actions={<AnalyticsFilters days={days} ranges={RANGES} projects={projects} projectId={query.project} />}
      />

      <div className="space-y-4 p-4 sm:p-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Tạo mới"
            value={totalCreated}
            icon={TrendingUp}
            hint={`Trong ${days} ngày qua`}
          />
          <StatCard
            label="Hoàn thành"
            value={totalCompleted}
            icon={CheckCircle2}
            tone="success"
            hint={`Trung bình ${(totalCompleted / days).toFixed(1)} việc/ngày`}
          />
          <StatCard
            label="Tỉ lệ hoàn thành"
            value={`${completionRate}%`}
            icon={Gauge}
            progress={completionRate}
            hint={`${doneTotal}/${totalTasks} công việc`}
          />
          <StatCard
            label="Thời gian xử lý TB"
            value={`${data.avgCycleTime.toFixed(1)} ngày`}
            icon={Timer}
            hint="Từ lúc tạo đến khi hoàn thành"
          />
        </div>

        <AnalyticsCharts
          trend={trend}
          statusData={statusData}
          priorityData={priorityData}
          projectData={projectData}
          workload={data.workload}
        />
      </div>
    </div>
  );
}
