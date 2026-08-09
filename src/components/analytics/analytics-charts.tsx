"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { UserAvatar } from "@/components/shared/user-avatar";
import { percent } from "@/lib/utils";

export type TrendPoint = { date: string; created: number; completed: number };
export type SliceDatum = { name: string; value: number; color: string };
export type WorkloadDatum = {
  userId: string;
  name: string;
  imageUrl: string | null;
  total: number;
  done: number;
};

const axisProps = {
  stroke: "hsl(var(--muted-foreground))",
  fontSize: 11,
  tickLine: false,
  axisLine: false,
} as const;

/** Shared tooltip shell so every chart reads the same in light and dark. */
function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number | string; color?: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lg">
      {label ? <p className="mb-1 font-medium">{label}</p> : null}
      {payload.map((item, i) => (
        <p key={i} className="flex items-center gap-1.5">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: item.color ?? "hsl(var(--primary))" }}
          />
          <span className="text-muted-foreground">{item.name}:</span>
          <span className="font-medium">{item.value}</span>
        </p>
      ))}
    </div>
  );
}

export function AnalyticsCharts({
  trend,
  statusData,
  priorityData,
  projectData,
  workload,
}: {
  trend: TrendPoint[];
  statusData: SliceDatum[];
  priorityData: SliceDatum[];
  projectData: SliceDatum[];
  workload: WorkloadDatum[];
}) {
  const totalStatus = statusData.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Throughput */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">Tasks created and completed</CardTitle>
          <CardDescription>Compare work coming in against work going out, day by day.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="fillCreated" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-1))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fillCompleted" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--chart-2))" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="hsl(var(--chart-2))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis allowDecimals={false} {...axisProps} />
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Area
                  type="monotone"
                  dataKey="created"
                  name="New"
                  stroke="hsl(var(--chart-1))"
                  fill="url(#fillCreated)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="completed"
                  name="Done"
                  stroke="hsl(var(--chart-2))"
                  fill="url(#fillCompleted)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Status donut */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Status distribution</CardTitle>
          <CardDescription>{totalStatus} tasks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="55%"
                  outerRadius="80%"
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {statusData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Priority bars */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Priority distribution</CardTitle>
          <CardDescription>Helps surface a backlog of urgent work.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priorityData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" {...axisProps} />
                <YAxis allowDecimals={false} {...axisProps} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                <Bar dataKey="value" name="Tasks" radius={[6, 6, 0, 0]}>
                  {priorityData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Per project */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workload by project</CardTitle>
          <CardDescription>Task count per project.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={projectData}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis type="number" allowDecimals={false} {...axisProps} />
                <YAxis type="category" dataKey="name" width={110} {...axisProps} />
                <Tooltip content={<ChartTooltip />} cursor={{ fill: "hsl(var(--muted))" }} />
                <Bar dataKey="value" name="Tasks" radius={[0, 6, 6, 0]}>
                  {projectData.map((entry) => (
                    <Cell key={entry.name} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Workload */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Workload by member</CardTitle>
          <CardDescription>Completion rate per person.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {workload.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No tasks have been assigned yet.
            </p>
          ) : (
            workload.slice(0, 8).map((item) => (
              <div key={item.userId} className="flex items-center gap-3">
                <UserAvatar
                  user={{ id: item.userId, name: item.name, imageUrl: item.imageUrl }}
                  className="size-8"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="truncate">{item.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {item.done}/{item.total}
                    </span>
                  </div>
                  <Progress value={percent(item.done, item.total)} className="mt-1.5" />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
