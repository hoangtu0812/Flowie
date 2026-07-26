"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  Dashboard,
  DashboardWidget,
  Project,
  VelocityPoint,
  WorkspaceOverview,
} from "@/lib/api";
import Icon from "@/components/ui/Icon";
import { Donut, BarList } from "@/components/ui/Charts";
import { TrendAreaChart, GroupedBarChart, StatTile } from "@/components/ui/DashboardCharts";
import { PRIORITY_HEX, statusSegments } from "@/lib/status";
import { trendLabel, money, hours } from "@/lib/format";

const WIDGET_TYPES = [
  { key: "kpi", label: "Chỉ số (KPI)" },
  { key: "status_donut", label: "Tròn: theo trạng thái" },
  { key: "priority_bar", label: "Cột: theo ưu tiên" },
  { key: "trend", label: "Xu hướng công việc" },
  { key: "project_table", label: "Bảng tiến độ dự án" },
  { key: "velocity", label: "Velocity theo sprint" },
];

const KPI_METRICS = [
  { key: "totalTasks", label: "Tổng công việc" },
  { key: "doneTasks", label: "Đã hoàn thành" },
  { key: "overdueTasks", label: "Quá hạn" },
  { key: "projectCount", label: "Số dự án" },
  { key: "memberCount", label: "Thành viên" },
  { key: "hoursLogged", label: "Giờ đã log" },
  { key: "costActual", label: "Chi phí thực tế" },
];

/**
 * User-built dashboards.
 *
 * The built-in Analytics tab answers the standard questions; this tab is for
 * the ones it doesn't — pick your own widgets, save them per workspace, share
 * with the team.
 */
export default function CustomDashboardsTab({ workspaceId }: { workspaceId: string }) {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [activeId, setActiveId] = useState("");
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [velocity, setVelocity] = useState<VelocityPoint[]>([]);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newShared, setNewShared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // widget builder state
  const [wType, setWType] = useState("kpi");
  const [wTitle, setWTitle] = useState("");
  const [wMetric, setWMetric] = useState("totalTasks");
  const [wProject, setWProject] = useState("");
  const [wWidth, setWWidth] = useState(1);

  const loadDashboards = useCallback(() => {
    if (!workspaceId) return;
    api.listDashboards(workspaceId).then((ds) => {
      setDashboards(ds);
      setActiveId((cur) => (ds.some((d) => d.id === cur) ? cur : ds[0]?.id ?? ""));
    }).catch(() => setDashboards([]));
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    loadDashboards();
    api.workspaceOverview(workspaceId).then(setOverview).catch(() => setOverview(null));
    api.listProjects(workspaceId).then(setProjects).catch(() => setProjects([]));
  }, [workspaceId, loadDashboards]);

  const active = dashboards.find((d) => d.id === activeId) ?? null;

  // Velocity is per-project, so fetch it only when a widget needs it.
  useEffect(() => {
    const needs = active?.widgets.find((w) => w.type === "velocity");
    const pid = needs?.config?.projectId as string | undefined;
    if (pid) api.projectVelocity(pid).then(setVelocity).catch(() => setVelocity([]));
    else setVelocity([]);
  }, [active]);

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

  async function createDashboard(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const d = await api.createDashboard(workspaceId, newName.trim(), newShared);
      setDashboards((p) => [...p, d]);
      setActiveId(d.id);
      setCreating(false);
      setNewName("");
      setNewShared(false);
      setEditing(true);
    } catch (err) { setError((err as Error).message); }
  }

  async function addWidget() {
    if (!active) return;
    const config: Record<string, unknown> = {};
    if (wType === "kpi") config.metric = wMetric;
    if ((wType === "velocity" || wType === "status_donut") && wProject) config.projectId = wProject;
    try {
      await api.addWidget(active.id, {
        type: wType,
        title: wTitle.trim() || WIDGET_TYPES.find((t) => t.key === wType)?.label || wType,
        config,
        width: wWidth,
      });
      setWTitle("");
      loadDashboards();
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <>
      {error && <p className="text-error text-body-sm mb-md">{error}</p>}

      <div className="flex flex-wrap items-center gap-sm mb-lg">
        {dashboards.map((d) => (
          <button
            key={d.id}
            onClick={() => setActiveId(d.id)}
            className={`flex items-center gap-xs px-3 py-1.5 rounded-md text-body-md transition-colors ${
              activeId === d.id
                ? "bg-surface-container-high text-on-surface font-medium"
                : "text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            {d.shared && <Icon name="group" size={16} />}
            {d.name}
          </button>
        ))}
        <button className="btn-ghost" onClick={() => setCreating(true)}>
          <Icon name="add" size={18} /> Dashboard mới
        </button>
        {active && (
          <button className="btn-ghost ml-auto" onClick={() => setEditing((v) => !v)}>
            <Icon name={editing ? "done" : "edit"} size={18} /> {editing ? "Xong" : "Sửa"}
          </button>
        )}
      </div>

      {creating && (
        <form onSubmit={createDashboard} className="card p-lg mb-lg flex flex-wrap items-end gap-sm">
          <div className="flex-grow min-w-[220px]">
            <label className="block text-label-md text-on-surface-variant mb-1">Tên dashboard</label>
            <input
              className="field"
              placeholder="Báo cáo tuần cho ban lãnh đạo"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
            />
          </div>
          <label className="flex items-center gap-2 text-body-md py-2">
            <input type="checkbox" checked={newShared} onChange={(e) => setNewShared(e.target.checked)} />
            Chia sẻ cho cả nhóm
          </label>
          <button className="btn-primary" disabled={!newName.trim()}>Tạo</button>
          <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>Huỷ</button>
        </form>
      )}

      {dashboards.length === 0 && !creating ? (
        <div className="card p-xl text-center text-on-surface-variant">
          <Icon name="dashboard_customize" size={40} className="text-outline mb-sm" />
          <p className="text-body-lg text-on-surface font-medium">Chưa có dashboard tuỳ chỉnh</p>
          <p className="text-body-sm mt-1">
            Tab “Phân tích” đã có sẵn số liệu chuẩn. Tạo dashboard riêng khi bạn cần
            ghép các chỉ số theo cách khác.
          </p>
        </div>
      ) : (
        <>
          {editing && active && (
            <div className="card p-lg mb-lg">
              <h3 className="text-headline-md mb-md">Thêm widget</h3>
              <div className="flex flex-wrap gap-sm items-end">
                <select className="field w-52" value={wType} onChange={(e) => setWType(e.target.value)}>
                  {WIDGET_TYPES.map((t) => (<option key={t.key} value={t.key}>{t.label}</option>))}
                </select>
                {wType === "kpi" && (
                  <select className="field w-44" value={wMetric} onChange={(e) => setWMetric(e.target.value)}>
                    {KPI_METRICS.map((m) => (<option key={m.key} value={m.key}>{m.label}</option>))}
                  </select>
                )}
                {wType === "velocity" && (
                  <select className="field w-52" value={wProject} onChange={(e) => setWProject(e.target.value)}>
                    <option value="">Chọn dự án…</option>
                    {projects.map((p) => (<option key={p.id} value={p.id}>{p.key} · {p.name}</option>))}
                  </select>
                )}
                <input
                  className="field w-48"
                  placeholder="Tiêu đề (tuỳ chọn)"
                  value={wTitle}
                  onChange={(e) => setWTitle(e.target.value)}
                />
                <select className="field w-28" value={wWidth} onChange={(e) => setWWidth(Number(e.target.value))}>
                  <option value={1}>Rộng 1</option>
                  <option value={2}>Rộng 2</option>
                  <option value={3}>Rộng 3</option>
                </select>
                <button className="btn-primary" onClick={addWidget}>
                  <Icon name="add" size={18} /> Thêm
                </button>
                <button
                  className="btn-ghost text-red-500 ml-auto"
                  onClick={async () => {
                    if (!window.confirm(`Xoá dashboard "${active.name}"?`)) return;
                    await api.deleteDashboard(active.id).catch((e) => setError(e.message));
                    loadDashboards();
                  }}
                >
                  <Icon name="delete" size={18} /> Xoá dashboard
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {(active?.widgets ?? []).map((wdg) => (
              <div
                key={wdg.id}
                className={`card p-6 ${
                  wdg.width === 3 ? "lg:col-span-3" : wdg.width === 2 ? "lg:col-span-2" : ""
                }`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[17px] font-bold text-on-surface">{wdg.title}</h3>
                  {editing && (
                    <button
                      className="p-1 rounded-full hover:bg-red-50 text-red-500"
                      onClick={async () => {
                        await api.deleteWidget(active!.id, wdg.id).catch(() => {});
                        loadDashboards();
                      }}
                    >
                      <Icon name="close" size={18} />
                    </button>
                  )}
                </div>
                <WidgetBody
                  widget={wdg}
                  overview={overview}
                  trendLabels={trendLabels}
                  trendRows={trendRows}
                  velocity={velocity}
                />
              </div>
            ))}
            {active && active.widgets.length === 0 && (
              <div className="card p-xl text-center text-on-surface-variant lg:col-span-3">
                Dashboard trống. Bật “Sửa” để thêm widget.
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

/** Renders one widget according to its type + config. */
function WidgetBody({
  widget, overview, trendLabels, trendRows, velocity,
}: {
  widget: DashboardWidget;
  overview: WorkspaceOverview | null;
  trendLabels: string[];
  trendRows: Record<string, number>[];
  velocity: VelocityPoint[];
}) {
  if (!overview) return <p className="text-body-sm text-on-surface-variant/60">Đang tải…</p>;

  switch (widget.type) {
    case "kpi": {
      const metric = String(widget.config?.metric ?? "totalTasks");
      const raw = (overview as unknown as Record<string, number>)[metric] ?? 0;
      const value =
        metric === "costActual" ? money(raw) : metric === "hoursLogged" ? hours(raw) : raw.toLocaleString();
      const delta =
        metric === "doneTasks" ? overview.completedDelta : metric === "totalTasks" ? overview.createdDelta : undefined;
      return (
        <StatTile
          title={KPI_METRICS.find((m) => m.key === metric)?.label ?? metric}
          value={value}
          delta={delta}
          invertDelta={metric === "overdueTasks"}
        />
      );
    }
    case "status_donut": {
      // Labels and colours come from the project's workflow columns.
      const segs = statusSegments(overview.byStatus, overview.statusMeta ?? []);
      return segs.length > 0 ? <Donut segments={segs} /> : <Empty />;
    }
    case "priority_bar": {
      const items = Object.entries(overview.byPriority).map(([k, v]) => ({
        label: k, value: v, color: PRIORITY_HEX[k] ?? "#2563eb",
      }));
      return items.length > 0 ? <BarList items={items} /> : <Empty />;
    }
    case "trend":
      return (
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
      );
    case "velocity":
      return velocity.length > 0 ? (
        <GroupedBarChart
          labels={velocity.map((v) => v.name)}
          rows={velocity.map((v) => ({ committed: v.committed, completed: v.completed }))}
          height={220}
          series={[
            { key: "committed", label: "Cam kết", color: "#c7d2fe" },
            { key: "completed", label: "Hoàn thành", color: "#4f46e5" },
          ]}
        />
      ) : (
        <p className="text-body-sm text-on-surface-variant/60">Chọn dự án có sprint để xem velocity.</p>
      );
    case "project_table":
      return (
        <div className="overflow-x-auto">
          <table className="w-full text-[14px]">
            <thead>
              <tr className="text-left text-on-surface-variant border-b border-outline-variant">
                <th className="py-2 font-semibold">Dự án</th>
                <th className="py-2 font-semibold">Tiến độ</th>
                <th className="py-2 font-semibold text-right">Quá hạn</th>
              </tr>
            </thead>
            <tbody>
              {overview.projects.map((p) => {
                const pct = p.total > 0 ? (p.done / p.total) * 100 : 0;
                return (
                  <tr key={p.projectId} className="border-b border-outline-variant/40 last:border-0">
                    <td className="py-2 font-semibold text-on-surface">{p.key}</td>
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-grow bg-surface-container-high rounded-full h-2 overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[12px] text-on-surface-variant w-9 text-right">{Math.round(pct)}%</span>
                      </div>
                    </td>
                    <td className={`py-2 text-right font-semibold ${p.overdue > 0 ? "text-red-500" : "text-on-surface-variant"}`}>
                      {p.overdue}
                    </td>
                  </tr>
                );
              })}
              {overview.projects.length === 0 && (
                <tr><td colSpan={3} className="py-6 text-center text-on-surface-variant">Chưa có dự án.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      );
    default:
      return <p className="text-body-sm text-on-surface-variant/60">Loại widget chưa hỗ trợ.</p>;
  }
}

function Empty() {
  return <p className="text-body-sm text-on-surface-variant/60">Chưa có dữ liệu.</p>;
}
