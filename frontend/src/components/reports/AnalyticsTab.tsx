"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api, ProjectStats, TrendRange, WorkspaceOverview } from "@/lib/api";
import Icon from "@/components/ui/Icon";
import { Donut, BarList } from "@/components/ui/Charts";
import { TrendAreaChart } from "@/components/ui/DashboardCharts";
import { PRIORITY_HEX, statusSegments } from "@/lib/status";
import { trendLabel, money, hours } from "@/lib/format";

/**
 * Built-in workspace analytics — the numbers everyone needs, with no setup.
 *
 * This used to be a separate /analytics page that only ever showed one project
 * at a time. It now defaults to the whole workspace and lets you narrow to a
 * single project, which is what the old page did.
 */
export default function AnalyticsTab({ workspaceId }: { workspaceId: string }) {
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [scope, setScope] = useState(""); // "" = whole workspace
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [range, setRange] = useState<TrendRange>("30d");

  useEffect(() => {
    if (!workspaceId) return;
    api.workspaceOverview(workspaceId, range).then(setOverview).catch(() => setOverview(null));
  }, [workspaceId, range]);

  useEffect(() => {
    if (!scope) { setStats(null); return; }
    api.projectStats(scope).then(setStats).catch(() => setStats(null));
  }, [scope]);

  // One shape for both scopes so the charts below don't branch.
  const view = useMemo(() => {
    if (scope && stats) {
      return {
        total: stats.total,
        done: stats.done,
        hoursLogged: stats.hoursLogged,
        costActual: stats.costActual,
        byStatus: stats.byStatus,
        byPriority: stats.byPriority,
      };
    }
    if (!scope && overview) {
      return {
        total: overview.totalTasks,
        done: overview.doneTasks,
        hoursLogged: overview.hoursLogged,
        costActual: overview.costActual,
        byStatus: overview.byStatus,
        byPriority: overview.byPriority,
      };
    }
    return null;
  }, [scope, stats, overview]);

  const trendLabels = useMemo(
    () => (overview?.trend ?? []).map((t) => trendLabel(t.month)),
    [overview],
  );
  const trendRows = useMemo(
    () => (overview?.trend ?? []).map((t) => ({
      created: t.created, inWork: t.inWork, completed: t.completed,
    })),
    [overview],
  );

  // Colours/labels come from the project's own workflow columns, so a status
  // added in Settings charts correctly instead of as a grey "wait" slice.
  const segments = useMemo(
    () => statusSegments(view?.byStatus ?? {}, overview?.statusMeta ?? []),
    [view, overview],
  );
  const prioBars = useMemo(
    () => Object.entries(view?.byPriority ?? {}).map(([k, v]) => ({
      label: k, value: v, color: PRIORITY_HEX[k] ?? "#2563eb",
    })),
    [view],
  );

  if (!overview) return <p className="text-on-surface-variant">Đang tải…</p>;

  const completion = view && view.total > 0 ? Math.round((view.done / view.total) * 100) : 0;

  return (
    <>
      <div className="flex items-center justify-between gap-md mb-lg">
        <p className="text-body-sm text-on-surface-variant">
          {scope ? "Số liệu của một dự án" : "Số liệu tổng hợp toàn không gian làm việc"}
        </p>
        <select className="field w-auto" value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="">Tất cả dự án</option>
          {overview.projects.map((p) => (
            <option key={p.projectId} value={p.projectId}>{p.key} · {p.name}</option>
          ))}
        </select>
      </div>

      <div className="grid gap-md grid-cols-2 lg:grid-cols-4 mb-lg">
        <Kpi icon="task_alt" label="Hoàn thành" value={`${completion}%`} tint="bg-green-50 text-green-600" />
        <Kpi icon="checklist" label="Việc" value={`${view?.done ?? 0}/${view?.total ?? 0}`} tint="bg-blue-50 text-blue-600" />
        <Kpi icon="schedule" label="Giờ đã log" value={hours(view?.hoursLogged ?? 0)} tint="bg-surface-container-high text-on-surface-variant" />
        <Kpi icon="payments" label="Chi phí thực tế" value={money(view?.costActual ?? 0)} tint="bg-orange-50 text-orange-600" />
      </div>

      <div className="grid gap-lg grid-cols-1 lg:grid-cols-2">
        <div className="card p-lg">
          <h3 className="text-headline-md mb-lg">Theo trạng thái</h3>
          {segments.length > 0 ? <Donut segments={segments} /> : <Empty />}
        </div>
        <div className="card p-lg">
          <h3 className="text-headline-md mb-lg">Theo độ ưu tiên</h3>
          {prioBars.length > 0 ? <BarList items={prioBars} /> : <Empty />}
        </div>

        {!scope && (
          <div className="card p-lg lg:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-md">
              <h3 className="text-headline-md">Xu hướng công việc</h3>
              <div className="flex items-center gap-1 bg-surface-container rounded-lg p-0.5">
                {([
                  { key: "30d", label: "30 ngày" },
                  { key: "6m", label: "6 tháng" },
                  { key: "12m", label: "12 tháng" },
                ] as const).map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setRange(r.key)}
                    className={`px-3 py-1 rounded-md text-body-sm font-medium transition-colors ${
                      range === r.key
                        ? "bg-surface-container-lowest text-on-surface shadow-sm"
                        : "text-on-surface-variant hover:text-on-surface"
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <TrendAreaChart
              labels={trendLabels}
              rows={trendRows}
              height={240}
              series={[
                { key: "created", label: "Tạo mới", color: "#6366f1" },
                { key: "inWork", label: "Đang làm", color: "#22c55e" },
                { key: "completed", label: "Hoàn thành", color: "#8b5cf6" },
              ]}
            />
          </div>
        )}

        {!scope && (
          <div className="card p-lg lg:col-span-2">
            <h3 className="text-headline-md mb-md">Tiến độ theo dự án</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-body-md">
                <thead>
                  <tr className="text-left text-on-surface-variant border-b border-outline-variant">
                    <th className="py-2 font-semibold">Dự án</th>
                    <th className="py-2 font-semibold w-1/3">Tiến độ</th>
                    <th className="py-2 font-semibold text-right">Giờ</th>
                    <th className="py-2 font-semibold text-right">Quá hạn</th>
                  </tr>
                </thead>
                <tbody>
                  {overview.projects.map((p) => {
                    const pct = p.total > 0 ? (p.done / p.total) * 100 : 0;
                    return (
                      <tr key={p.projectId} className="border-b border-outline-variant/40 last:border-0">
                        <td className="py-2">
                          <Link href={`/projects/${p.projectId}`} className="font-semibold text-on-surface hover:text-primary">
                            {p.key} · {p.name}
                          </Link>
                        </td>
                        <td className="py-2">
                          <div className="flex items-center gap-2">
                            <div className="flex-grow bg-surface-container-high rounded-full h-2 overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[12px] text-on-surface-variant w-9 text-right">{Math.round(pct)}%</span>
                          </div>
                        </td>
                        <td className="py-2 text-right text-on-surface-variant">{p.hoursLogged.toFixed(1)}</td>
                        <td className={`py-2 text-right font-semibold ${p.overdue > 0 ? "text-red-500" : "text-on-surface-variant"}`}>
                          {p.overdue}
                        </td>
                      </tr>
                    );
                  })}
                  {overview.projects.length === 0 && (
                    <tr><td colSpan={4} className="py-6 text-center text-on-surface-variant">Chưa có dự án.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function Kpi({ icon, label, value, tint }: { icon: string; label: string; value: string; tint: string }) {
  return (
    <div className="card p-lg flex items-center gap-md">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${tint}`}>
        <Icon name={icon} size={22} />
      </div>
      <div className="min-w-0">
        <p className="text-headline-lg text-on-surface leading-tight truncate">{value}</p>
        <p className="text-body-sm text-on-surface-variant">{label}</p>
      </div>
    </div>
  );
}

function Empty() {
  return <p className="text-body-sm text-on-surface-variant/60">Chưa có dữ liệu.</p>;
}
