"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, Project, Workspace, WorkspaceOverview } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import {
  StatTile,
  BarSparkline,
  AreaSparkline,
  RingProgress,
  TrendAreaChart,
} from "@/components/ui/DashboardCharts";
import { monthLabel } from "@/lib/format";

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [ov, setOv] = useState<WorkspaceOverview | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState({ name: "", key: "", description: "" });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getWorkspace(id).then(setWs).catch(() => {});
    api.workspaceOverview(id).then(setOv).catch(() => {});
    api.listProjects(id).then(setProjects).catch((e) => setError(e.message));
  }, [id]);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const p = await api.createProject(id, {
        name: form.name.trim(),
        key: form.key.trim().toUpperCase(),
        description: form.description.trim(),
      });
      setProjects((prev) => [p, ...prev]);
      setForm({ name: "", key: "", description: "" });
      setOpen(false);
      api.workspaceOverview(id).then(setOv).catch(() => {});
    } catch (err) {
      setError((err as Error).message);
    }
  }

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

  const donePct = ov && ov.totalTasks > 0 ? (ov.doneTasks / ov.totalTasks) * 100 : 0;
  const openTasks = ov ? ov.totalTasks - ov.doneTasks : 0;
  const overduePct = openTasks > 0 && ov ? (ov.overdueTasks / openTasks) * 100 : 0;

  const actions = (
    <button className="btn-primary" onClick={() => setOpen(true)}>
      <Icon name="add" size={20} />
      Dự án mới
    </button>
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
                        <Link href={`/projects/${p.projectId}/dashboard`} className="flex items-center gap-3 group">
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

        <h3 className="text-[20px] font-bold text-gray-900 mb-6">Danh sách Dự án</h3>

        <div className="grid gap-md grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <div className="card p-lg hover:border-primary/40 hover:shadow-popover transition-all h-full">
                <div className="flex items-center justify-between mb-sm">
                  <span className="chip bg-primary-container/10 text-primary">{p.key}</span>
                  <span
                    className={`chip ${
                      p.status === "active"
                        ? "bg-success-container text-success"
                        : "bg-surface-container-highest text-on-surface-variant"
                    }`}
                  >
                    {p.status}
                  </span>
                </div>
                <p className="text-headline-md text-on-surface">{p.name}</p>
                <p className="text-body-sm text-on-surface-variant mt-1 line-clamp-2">
                  {p.description || "Không có mô tả"}
                </p>
              </div>
            </Link>
          ))}
          {projects.length === 0 && (
            <div className="card p-xl text-center text-on-surface-variant col-span-full">
              <Icon name="folder_open" size={40} className="text-outline mb-sm" />
              <p>Chưa có dự án nào. Nhấn “Dự án mới” để tạo.</p>
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-md" onClick={() => setOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={createProject}
            className="card shadow-modal p-lg w-full max-w-md"
          >
            <h3 className="text-headline-lg text-on-surface mb-md">Tạo dự án</h3>
            <label className="block text-label-md text-on-surface-variant mb-1">Tên dự án</label>
            <input
              className="field mb-md"
              placeholder="Website Revamp"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
            />
            <label className="block text-label-md text-on-surface-variant mb-1">Mã (KEY)</label>
            <input
              className="field mb-md uppercase"
              placeholder="WEB"
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
            />
            <label className="block text-label-md text-on-surface-variant mb-1">Mô tả</label>
            <textarea
              className="field mb-lg"
              rows={3}
              placeholder="Tuỳ chọn"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
            <div className="flex justify-end gap-sm">
              <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
                Huỷ
              </button>
              <button className="btn-primary" disabled={!form.name.trim() || !form.key.trim()}>
                Tạo dự án
              </button>
            </div>
          </form>
        </div>
      )}
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
