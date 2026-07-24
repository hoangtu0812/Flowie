"use client";

import { useEffect, useMemo, useState } from "react";
import { api, Project, ProjectStats, Workspace } from "@/lib/api";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import { Donut, BarList } from "@/components/Charts";
import { STATUS_HEX, PRIORITY_HEX, statusLabel } from "@/lib/status";

export default function AnalyticsPage() {
  const [projects, setProjects] = useState<(Project & { wsName: string })[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [stats, setStats] = useState<ProjectStats | null>(null);

  useEffect(() => {
    (async () => {
      const wss: Workspace[] = await api.listWorkspaces().catch(() => []);
      const all: (Project & { wsName: string })[] = [];
      for (const ws of wss) {
        const ps = await api.listProjects(ws.id).catch(() => []);
        ps.forEach((p) => all.push({ ...p, wsName: ws.name }));
      }
      setProjects(all);
      if (all.length > 0) setSelected(all[0].id);
    })();
  }, []);

  useEffect(() => {
    if (selected) api.projectStats(selected).then(setStats).catch(() => setStats(null));
  }, [selected]);

  const statusSegments = useMemo(
    () =>
      stats
        ? Object.entries(stats.byStatus).map(([k, v]) => ({
            label: statusLabel(k),
            value: v,
            color: STATUS_HEX[k] ?? "#9aa2ad",
          }))
        : [],
    [stats],
  );
  const prioBars = useMemo(
    () =>
      stats
        ? Object.entries(stats.byPriority).map(([k, v]) => ({
            label: k,
            value: v,
            color: PRIORITY_HEX[k] ?? "#2563eb",
          }))
        : [],
    [stats],
  );

  const completion = stats && stats.total > 0 ? Math.round((stats.done / stats.total) * 100) : 0;

  const actions = (
    <select
      className="field w-auto"
      value={selected}
      onChange={(e) => setSelected(e.target.value)}
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>{p.wsName} · {p.name}</option>
      ))}
    </select>
  );

  return (
    <AppShell title="Analytics" actions={projects.length > 0 ? actions : undefined}>
      <div className="p-lg max-w-6xl">
        {projects.length === 0 && (
          <div className="card p-xl text-center text-on-surface-variant">Chưa có dự án để phân tích.</div>
        )}
        {stats && (
          <>
            {/* KPI row */}
            <div className="grid gap-md grid-cols-2 lg:grid-cols-4 mb-lg">
              <Kpi icon="task_alt" label="Hoàn thành" value={`${completion}%`} tint="bg-success-container text-success" />
              <Kpi icon="checklist" label="Việc" value={`${stats.done}/${stats.total}`} tint="bg-primary-container/10 text-primary" />
              <Kpi icon="data_usage" label="Story points" value={`${stats.storyPointsDone}/${stats.storyPointsTotal}`} tint="bg-tertiary-fixed text-tertiary" />
              <Kpi icon="schedule" label="Giờ đã log" value={`${stats.hoursLogged.toFixed(1)}h`} tint="bg-surface-container-high text-on-surface-variant" />
            </div>

            <div className="grid gap-lg grid-cols-1 lg:grid-cols-2">
              <div className="card p-lg">
                <h3 className="text-headline-md mb-lg">Task Status</h3>
                {statusSegments.length > 0 ? <Donut segments={statusSegments} /> : <Empty />}
              </div>
              <div className="card p-lg">
                <h3 className="text-headline-md mb-lg">Theo độ ưu tiên</h3>
                {prioBars.length > 0 ? <BarList items={prioBars} /> : <Empty />}
              </div>

              <div className="card p-lg lg:col-span-2">
                <h3 className="text-headline-md mb-md">Project Financials</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-lg">
                  <Money label="Chi phí thực tế (worklog × rate)" value={stats.costActual} />
                  <div>
                    <p className="text-body-sm text-on-surface-variant mb-1">Tiến độ</p>
                    <div className="bg-surface-container-high rounded-full h-2.5 overflow-hidden">
                      <div className="h-full bg-primary rounded-full" style={{ width: `${completion}%` }} />
                    </div>
                    <p className="text-body-sm text-on-surface-variant mt-1">{completion}% hoàn thành</p>
                  </div>
                  <div>
                    <p className="text-body-sm text-on-surface-variant mb-1">Tổng giờ</p>
                    <p className="text-headline-lg text-on-surface">{stats.hoursLogged.toFixed(1)}h</p>
                  </div>
                </div>
                <p className="text-body-sm text-on-surface-variant/70 mt-md">
                  Chi phí = Σ(giờ worklog × rate/giờ của nhân sự). Đặt rate ở phần Team (sắp có).
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function Kpi({ icon, label, value, tint }: { icon: string; label: string; value: string; tint: string }) {
  return (
    <div className="card p-lg flex items-center gap-md">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${tint}`}>
        <Icon name={icon} size={22} />
      </div>
      <div>
        <p className="text-headline-lg text-on-surface leading-tight">{value}</p>
        <p className="text-body-sm text-on-surface-variant">{label}</p>
      </div>
    </div>
  );
}

function Money({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-body-sm text-on-surface-variant mb-1">{label}</p>
      <p className="text-headline-lg text-on-surface">
        {value.toLocaleString(undefined, { style: "currency", currency: "USD" })}
      </p>
    </div>
  );
}

function Empty() {
  return <p className="text-body-sm text-on-surface-variant/60">Chưa có dữ liệu.</p>;
}
