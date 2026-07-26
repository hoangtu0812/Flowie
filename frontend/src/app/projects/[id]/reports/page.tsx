"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  api,
  Project,
  Sprint,
  SprintBurndown,
  SprintCapacity,
  VelocityPoint,
} from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import ProjectTabs from "@/components/layout/ProjectTabs";
import Avatar from "@/components/ui/Avatar";
import { TrendAreaChart, GroupedBarChart } from "@/components/ui/DashboardCharts";

export default function ProjectReportsPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selected, setSelected] = useState("");
  const [burndown, setBurndown] = useState<SprintBurndown | null>(null);
  const [capacity, setCapacity] = useState<SprintCapacity | null>(null);
  const [velocity, setVelocity] = useState<VelocityPoint[]>([]);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    api.projectVelocity(id).then(setVelocity).catch(() => setVelocity([]));
    api.listSprints(id).then((ss) => {
      setSprints(ss);
      // Prefer the active sprint, else the last one.
      const active = ss.find((s) => s.state === "active") ?? ss[ss.length - 1];
      if (active) setSelected(active.id);
    }).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!selected) return;
    api.sprintBurndown(selected).then(setBurndown).catch(() => setBurndown(null));
    api.sprintCapacity(selected).then(setCapacity).catch(() => setCapacity(null));
  }, [selected]);

  const burnLabels = useMemo(
    () => (burndown?.points ?? []).map((p) => p.date.slice(5)), // MM-DD
    [burndown],
  );
  const burnRows = useMemo(
    () =>
      (burndown?.points ?? []).map((p) => ({
        remaining: p.remaining,
        ideal: Math.round(p.ideal * 10) / 10,
      })),
    [burndown],
  );

  const velLabels = useMemo(() => velocity.map((v) => v.name), [velocity]);
  const velRows = useMemo(
    () => velocity.map((v) => ({ committed: v.committed, completed: v.completed })),
    [velocity],
  );

  const donePct =
    capacity && capacity.totalPoints > 0
      ? Math.round((capacity.donePoints / capacity.totalPoints) * 100)
      : 0;

  const actions = sprints.length > 0 && (
    <select className="field w-auto" value={selected} onChange={(e) => setSelected(e.target.value)}>
      {sprints.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} {s.state === "active" ? "· đang chạy" : s.state === "completed" ? "· đã xong" : ""}
        </option>
      ))}
    </select>
  );

  return (
    <AppShell
      title={project ? `${project.key} · Agile Reports` : "Agile Reports"}
      actions={actions || undefined}
    >
      <div className="p-lg max-w-[1400px]">
        <ProjectTabs projectId={id} />

        {sprints.length === 0 ? (
          <div className="card p-xl text-center text-on-surface-variant">
            <Icon name="sprint" size={40} className="text-outline mb-sm" />
            <p>Chưa có sprint nào. Tạo sprint ở tab Sprints để xem báo cáo Agile.</p>
          </div>
        ) : (
          <>
            {/* Sprint summary */}
            <div className="grid gap-5 grid-cols-2 xl:grid-cols-4 mb-6">
              <MiniStat icon="data_usage" label="Story points" value={`${burndown?.donePoints ?? 0}/${burndown?.totalPoints ?? 0}`} />
              <MiniStat icon="checklist" label="Công việc" value={`${burndown?.doneTasks ?? 0}/${burndown?.totalTasks ?? 0}`} />
              <MiniStat icon="task_alt" label="Hoàn thành" value={`${donePct}%`} />
              <MiniStat
                icon="event"
                label="Thời gian"
                value={
                  burndown?.startDate && burndown?.endDate
                    ? `${burndown.startDate.slice(5, 10)} → ${burndown.endDate.slice(5, 10)}`
                    : "Chưa đặt"
                }
              />
            </div>

            {/* Burndown */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-8">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[17px] font-bold text-gray-900">Burndown Chart</h3>
                <span className="text-[13px] text-gray-400">{burndown?.name}</span>
              </div>
              {burnRows.length > 0 ? (
                <TrendAreaChart
                  labels={burnLabels}
                  rows={burnRows}
                  height={280}
                  series={[
                    { key: "remaining", label: "Còn lại (thực tế)", color: "#e11d48" },
                    { key: "ideal", label: "Lý tưởng", color: "#94a3b8" },
                  ]}
                />
              ) : (
                <p className="text-body-sm text-on-surface-variant/60">
                  Sprint chưa có công việc nào để vẽ burndown.
                </p>
              )}
              {burndown && burndown.totalPoints === 0 && burndown.totalTasks > 0 && (
                <p className="text-body-sm text-on-surface-variant/70 mt-sm">
                  Các công việc chưa được ước lượng story points — biểu đồ sẽ phẳng.
                  Đặt story points trong TaskDrawer để burndown có ý nghĩa.
                </p>
              )}
            </div>

            {/* Velocity */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-8">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-[17px] font-bold text-gray-900">Velocity Chart</h3>
                <span className="text-[13px] text-gray-400">Theo từng sprint</span>
              </div>
              <GroupedBarChart
                labels={velLabels}
                rows={velRows}
                series={[
                  { key: "committed", label: "Cam kết", color: "#c7d2fe" },
                  { key: "completed", label: "Hoàn thành", color: "#4f46e5" },
                ]}
              />
            </div>

            {/* Capacity */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-[17px] font-bold text-gray-900">Sprint Capacity</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[14px]">
                  <thead>
                    <tr className="text-left text-gray-500 border-b border-gray-100">
                      <th className="py-3 px-6 font-semibold">Thành viên</th>
                      <th className="py-3 px-4 font-semibold">Tải</th>
                      <th className="py-3 px-4 font-semibold text-right">Points</th>
                      <th className="py-3 px-6 font-semibold text-right">Việc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(capacity?.byAssignee ?? []).map((a) => {
                      const share =
                        capacity && capacity.totalPoints > 0
                          ? (a.points / capacity.totalPoints) * 100
                          : 0;
                      return (
                        <tr key={a.userId ?? "unassigned"} className="border-b border-gray-50 last:border-0">
                          <td className="py-3 px-6">
                            <div className="flex items-center gap-3">
                              <Avatar name={a.displayName} size={32} />
                              <span className="font-semibold text-gray-900 truncate">{a.displayName}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 min-w-[160px]">
                            <div className="flex items-center gap-2">
                              <div className="flex-grow bg-gray-100 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${share > 50 ? "bg-orange-500" : "bg-indigo-500"}`}
                                  style={{ width: `${share}%` }}
                                />
                              </div>
                              <span className="text-[12px] font-semibold text-gray-500 w-9 text-right">
                                {Math.round(share)}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right text-gray-700">{a.points}</td>
                          <td className="py-3 px-6 text-right text-gray-700">{a.doneTasks}/{a.tasks}</td>
                        </tr>
                      );
                    })}
                    {(capacity?.byAssignee ?? []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-gray-500">
                          Sprint chưa có công việc nào.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
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
