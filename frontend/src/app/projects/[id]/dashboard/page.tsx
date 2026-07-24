"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, Project, ProjectOverview } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import ProjectTabs from "@/components/layout/ProjectTabs";
import Avatar from "@/components/ui/Avatar";
import { Donut, BarList } from "@/components/ui/Charts";
import {
  StatTile,
  BarSparkline,
  AreaSparkline,
  RingProgress,
  TrendAreaChart,
} from "@/components/ui/DashboardCharts";
import { STATUS_HEX, PRIORITY_HEX, statusLabel } from "@/lib/status";
import { monthLabel, money, hours } from "@/lib/format";

export default function ProjectDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [ov, setOv] = useState<ProjectOverview | null>(null);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    api.projectOverview(id).then(setOv).catch(() => {});
  }, [id]);

  const trendLabels = useMemo(() => (ov?.trend ?? []).map((t) => monthLabel(t.month)), [ov]);
  const trendRows = useMemo(
    () =>
      (ov?.trend ?? []).map((t) => ({
        created: t.created,
        completed: t.completed,
        inWork: t.inWork,
      })),
    [ov],
  );
  const hoursRows = useMemo(
    () => (ov?.trend ?? []).map((t) => ({ hours: Math.round(t.hours * 10) / 10 })),
    [ov],
  );

  const statusSegments = useMemo(
    () =>
      ov
        ? Object.entries(ov.byStatus).map(([k, v]) => ({
            label: statusLabel(k),
            value: v,
            color: STATUS_HEX[k] ?? "#9aa2ad",
          }))
        : [],
    [ov],
  );
  const prioBars = useMemo(
    () =>
      ov
        ? Object.entries(ov.byPriority).map(([k, v]) => ({
            label: k,
            value: v,
            color: PRIORITY_HEX[k] ?? "#2563eb",
          }))
        : [],
    [ov],
  );

  const donePct = ov && ov.total > 0 ? (ov.done / ov.total) * 100 : 0;
  const openTasks = ov ? ov.total - ov.done : 0;
  const overduePct = ov && openTasks > 0 ? (ov.overdueTasks / openTasks) * 100 : 0;

  return (
    <AppShell title={project ? `${project.key} · Dashboard` : "Dashboard"}>
      <div className="p-lg max-w-[1400px]">
        <ProjectTabs projectId={id} />

        {/* KPI tiles */}
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 mb-6">
          <StatTile
            title="Tổng công việc"
            value={(ov?.total ?? 0).toLocaleString()}
            delta={ov?.createdDelta}
            visual={<BarSparkline values={(ov?.trend ?? []).map((t) => t.created)} />}
          />
          <StatTile
            title="Đã hoàn thành"
            value={(ov?.done ?? 0).toLocaleString()}
            delta={ov?.completedDelta}
            visual={<AreaSparkline values={(ov?.trend ?? []).map((t) => t.completed)} />}
          />
          <StatTile
            title="Chưa hoàn thành"
            value={openTasks.toLocaleString()}
            visual={<RingProgress percent={100 - donePct} color="#f97316" track="#fdeee2" />}
          />
          <StatTile
            title="Quá hạn"
            value={(ov?.overdueTasks ?? 0).toLocaleString()}
            visual={<RingProgress percent={overduePct} color="#e11d48" track="#fee2e6" />}
          />
        </div>

        {/* Secondary KPIs */}
        <div className="grid gap-5 grid-cols-2 xl:grid-cols-4 mb-8">
          <MiniStat icon="data_usage" label="Story points" value={`${ov?.storyPointsDone ?? 0}/${ov?.storyPointsTotal ?? 0}`} />
          <MiniStat icon="task_alt" label="Hoàn thành" value={`${Math.round(donePct)}%`} />
          <MiniStat icon="schedule" label="Giờ đã log" value={hours(ov?.hoursLogged ?? 0)} />
          <MiniStat icon="payments" label="Chi phí thực tế" value={money(ov?.costActual ?? 0)} />
        </div>

        {/* Trend */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-8">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[17px] font-bold text-gray-900">Biểu đồ công việc</h3>
            <span className="text-[13px] text-gray-400">6 tháng gần nhất</span>
          </div>
          <TrendAreaChart
            labels={trendLabels}
            rows={trendRows}
            series={[
              { key: "created", label: "Tạo mới", color: "#6366f1" },
              { key: "inWork", label: "Đang làm", color: "#22c55e" },
              { key: "completed", label: "Hoàn thành", color: "#8b5cf6" },
            ]}
          />
        </div>

        <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 mb-8">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-[17px] font-bold text-gray-900 mb-5">Theo trạng thái</h3>
            {statusSegments.length > 0 ? <Donut segments={statusSegments} /> : <Empty />}
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <h3 className="text-[17px] font-bold text-gray-900 mb-5">Theo độ ưu tiên</h3>
            {prioBars.length > 0 ? <BarList items={prioBars} /> : <Empty />}
          </div>
        </div>

        {/* Hours trend */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-8">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[17px] font-bold text-gray-900">Giờ làm việc theo tháng</h3>
            <span className="text-[13px] text-gray-400">Từ worklog</span>
          </div>
          <TrendAreaChart
            labels={trendLabels}
            rows={hoursRows}
            height={220}
            valueSuffix="h"
            series={[{ key: "hours", label: "Giờ đã log", color: "#0ea5e9" }]}
          />
        </div>

        {/* Assignee load */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-[17px] font-bold text-gray-900">Phân bổ theo nhân sự</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-3 px-6 font-semibold">Thành viên</th>
                  <th className="py-3 px-4 font-semibold">Tiến độ</th>
                  <th className="py-3 px-4 font-semibold text-right">Việc</th>
                  <th className="py-3 px-4 font-semibold text-right">Quá hạn</th>
                  <th className="py-3 px-6 font-semibold text-right">Giờ</th>
                </tr>
              </thead>
              <tbody>
                {(ov?.assignees ?? []).map((a) => {
                  const pct = a.total > 0 ? (a.done / a.total) * 100 : 0;
                  return (
                    <tr key={a.userId ?? "unassigned"} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="py-3 px-6">
                        <div className="flex items-center gap-3">
                          <Avatar name={a.displayName} size={32} />
                          <span className="font-semibold text-gray-900 truncate">{a.displayName}</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 min-w-[160px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-grow bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[12px] font-semibold text-gray-500 w-9 text-right">{Math.round(pct)}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-gray-700">{a.done}/{a.total}</td>
                      <td className={`py-3 px-4 text-right font-semibold ${a.overdue > 0 ? "text-red-500" : "text-gray-400"}`}>{a.overdue}</td>
                      <td className="py-3 px-6 text-right text-gray-700">{hours(a.hoursLogged)}</td>
                    </tr>
                  );
                })}
                {(ov?.assignees ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-gray-500">Chưa có công việc nào.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function MiniStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm flex items-center gap-4">
      <div className="w-11 h-11 rounded-xl bg-gray-100 text-gray-700 flex items-center justify-center shrink-0">
        <Icon name={icon} size={22} />
      </div>
      <div className="min-w-0">
        <p className="text-[20px] font-bold text-gray-900 leading-tight truncate">{value}</p>
        <p className="text-[13px] font-medium text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  );
}

function Empty() {
  return <p className="text-body-sm text-on-surface-variant/60">Chưa có dữ liệu.</p>;
}
