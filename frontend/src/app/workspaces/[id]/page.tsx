"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, Project, TrendRange, Workspace, WorkspaceOverview } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import {
  StatTile,
  BarSparkline,
  AreaSparkline,
  RingProgress,
  TrendAreaChart,
} from "@/components/ui/DashboardCharts";
import NewProjectDialog from "@/components/project/NewProjectDialog";
import NewTaskDialog from "@/components/task/NewTaskDialog";
import { trendLabel } from "@/lib/format";

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [ov, setOv] = useState<WorkspaceOverview | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  /** null = closed; otherwise which creation dialog is open. */
  const [dialog, setDialog] = useState<"project" | "task" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Trend chart window. 30 days is the default — it's the horizon people act on. */
  const [range, setRange] = useState<TrendRange>("30d");

  const reload = useCallback(() => {
    api.workspaceOverview(id, range).then(setOv).catch(() => {});
    api.listProjects(id).then(setProjects).catch((e) => setError(e.message));
  }, [id, range]);

  useEffect(() => {
    api.getWorkspace(id).then(setWs).catch(() => {});
    reload();
  }, [id, reload]);

  const trendLabels = useMemo(() => (ov?.trend ?? []).map((t) => trendLabel(t.month)), [ov]);
  const trendRows = useMemo(
    () =>
      (ov?.trend ?? []).map((t) => ({
        created: t.created,
        completed: t.completed,
        inWork: t.inWork,
      })),
    [ov],
  );

  const donePct = ov && ov.totalTasks > 0 ? (ov.doneTasks / ov.totalTasks) * 100 : 0;
  const openTasks = ov ? ov.totalTasks - ov.doneTasks : 0;
  const overduePct = openTasks > 0 && ov ? (ov.overdueTasks / openTasks) * 100 : 0;

  // A single "Tạo mới" affordance on the dashboard — previously the only way
  // to create anything was to already be inside a project.
  const actions = (
    <div className="relative">
      <button className="btn-primary" onClick={() => setMenuOpen((v) => !v)}>
        <Icon name="add" size={20} />
        Tạo mới
        <Icon name="expand_more" size={18} />
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 mt-1 z-50 w-52 card shadow-popover py-1">
            <MenuItem
              icon="folder_open"
              label="Dự án mới"
              onClick={() => { setMenuOpen(false); setDialog("project"); }}
            />
            <MenuItem
              icon="check_circle"
              label="Công việc mới"
              onClick={() => { setMenuOpen(false); setDialog("task"); }}
              disabled={projects.length === 0}
              hint={projects.length === 0 ? "Cần có dự án trước" : undefined}
            />
            <Link
              href="/calendar"
              className="flex items-center gap-3 px-4 py-2 text-body-md text-on-surface hover:bg-surface-container"
              onClick={() => setMenuOpen(false)}
            >
              <Icon name="event" size={18} className="text-on-surface-variant" />
              Lịch họp / sự kiện
            </Link>
          </div>
        </>
      )}
    </div>
  );

  return (
    <AppShell title={ws?.name || "Workspace"} actions={actions}>
      <div className="p-lg max-w-[1400px]">
        <div className="flex items-center gap-xs text-body-sm text-on-surface-variant mb-lg">
          <Link href="/" className="hover:text-primary">Dashboard</Link>
          <Icon name="chevron_right" size={16} />
          <span className="text-on-surface">{ws?.name}</span>
        </div>

        {error && <p className="text-error text-body-sm mb-md">{error}</p>}

        {/* KPI tiles */}
        <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 mb-6">
          <StatTile
            title="Tổng công việc"
            value={(ov?.totalTasks ?? 0).toLocaleString()}
            delta={ov?.createdDelta}
            visual={<BarSparkline values={(ov?.trend ?? []).map((t) => t.created)} />}
          />
          <StatTile
            title="Đã hoàn thành"
            value={(ov?.doneTasks ?? 0).toLocaleString()}
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
          <MiniStat icon="folder_open" label="Dự án" value={String(ov?.projectCount ?? 0)} />
          <MiniStat icon="group" label="Thành viên" value={String(ov?.memberCount ?? 0)} />
          <MiniStat icon="schedule" label="Giờ đã log" value={`${(ov?.hoursLogged ?? 0).toFixed(1)}h`} />
          <MiniStat
            icon="payments"
            label="Chi phí thực tế"
            value={(ov?.costActual ?? 0).toLocaleString(undefined, { style: "currency", currency: "USD" })}
          />
        </div>

        {/* Trend chart */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm mb-8">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <h3 className="text-[17px] font-bold text-gray-900">Biểu đồ công việc</h3>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
              {([
                { key: "30d", label: "30 ngày" },
                { key: "6m", label: "6 tháng" },
                { key: "12m", label: "12 tháng" },
              ] as const).map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  className={`px-3 py-1 rounded-md text-[13px] font-medium transition-colors ${
                    range === r.key
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-900"
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
            series={[
              { key: "created", label: "Tạo mới", color: "#6366f1" },
              { key: "inWork", label: "Đang làm", color: "#22c55e" },
              { key: "completed", label: "Hoàn thành", color: "#8b5cf6" },
            ]}
          />
        </div>

        {/* Per-project rollup */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm mb-8 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-[17px] font-bold text-gray-900">Tiến độ theo dự án</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="text-left text-gray-500 border-b border-gray-100">
                  <th className="py-3 px-6 font-semibold">Dự án</th>
                  <th className="py-3 px-4 font-semibold">Tiến độ</th>
                  <th className="py-3 px-4 font-semibold text-right">Việc</th>
                  <th className="py-3 px-4 font-semibold text-right">Đang làm</th>
                  <th className="py-3 px-4 font-semibold text-right">Quá hạn</th>
                  <th className="py-3 px-4 font-semibold text-right">Giờ</th>
                  <th className="py-3 px-6 font-semibold text-right">Chi phí</th>
                </tr>
              </thead>
              <tbody>
                {(ov?.projects ?? []).map((p) => {
                  const pct = p.total > 0 ? (p.done / p.total) * 100 : 0;
                  return (
                    <tr key={p.projectId} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                      <td className="py-3 px-6">
                        {/* Same destination as the sidebar's project list, so a
                            project always opens the same way. */}
                        <Link href={`/projects/${p.projectId}`} className="flex items-center gap-3 group">
                          <span className="chip bg-primary-container/10 text-primary">{p.key}</span>
                          <span className="font-semibold text-gray-900 group-hover:text-primary truncate">{p.name}</span>
                        </Link>
                      </td>
                      <td className="py-3 px-4 min-w-[160px]">
                        <div className="flex items-center gap-2">
                          <div className="flex-grow bg-gray-100 rounded-full h-2 overflow-hidden">
                            <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[12px] font-semibold text-gray-500 w-9 text-right">{Math.round(pct)}%</span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right text-gray-700">{p.done}/{p.total}</td>
                      <td className="py-3 px-4 text-right text-gray-700">{p.inProgress}</td>
                      <td className={`py-3 px-4 text-right font-semibold ${p.overdue > 0 ? "text-red-500" : "text-gray-400"}`}>{p.overdue}</td>
                      <td className="py-3 px-4 text-right text-gray-700">{p.hoursLogged.toFixed(1)}h</td>
                      <td className="py-3 px-6 text-right text-gray-700">
                        {p.costActual.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                      </td>
                    </tr>
                  );
                })}
                {(ov?.projects ?? []).length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-gray-500">Chưa có dự án nào.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* The rollup table above already lists every project with live numbers,
            so the old duplicate card grid was removed in favour of one link. */}
        {projects.length === 0 ? (
          <div className="card p-xl text-center text-on-surface-variant">
            <Icon name="folder_open" size={40} className="text-outline mb-sm" />
            <p className="text-body-lg font-medium text-on-surface">Chưa có dự án nào</p>
            <p className="text-body-sm mt-1 mb-md">Tạo dự án đầu tiên để bắt đầu theo dõi công việc.</p>
            <button className="btn-primary mx-auto" onClick={() => setDialog("project")}>
              <Icon name="add" size={18} /> Dự án mới
            </button>
          </div>
        ) : (
          <Link href="/projects" className="btn-ghost w-fit">
            <Icon name="grid_view" size={18} /> Xem tất cả {projects.length} dự án
          </Link>
        )}
      </div>

      {dialog === "project" && (
        <NewProjectDialog
          workspaceId={id}
          onClose={() => setDialog(null)}
          onCreated={() => { setDialog(null); reload(); }}
        />
      )}
      {dialog === "task" && (
        <NewTaskDialog
          workspaceId={id}
          onClose={() => setDialog(null)}
          onCreated={() => { setDialog(null); reload(); }}
        />
      )}
    </AppShell>
  );
}

function MenuItem({
  icon, label, onClick, disabled, hint,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  hint?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className="w-full flex items-center gap-3 px-4 py-2 text-body-md text-on-surface hover:bg-surface-container disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <Icon name={icon} size={18} className="text-on-surface-variant" />
      {label}
    </button>
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
