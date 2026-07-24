"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, DashboardStats, Workspace } from "@/lib/api";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";

function StatCard({ icon, label, value, tint }: { icon: string; label: string; value: React.ReactNode; tint: string }) {
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

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.dashboard().then(setStats).catch(() => {});
    api.listWorkspaces().then(setWorkspaces).catch(() => {});
  }, []);

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const ws = await api.createWorkspace(newName.trim());
      setWorkspaces((p) => [ws, ...p]);
      setNewName("");
      api.dashboard().then(setStats).catch(() => {});
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AppShell title="Dashboard">
      <div className="p-lg max-w-6xl">
        <h2 className="text-headline-xl text-on-surface mb-lg">Chào mừng trở lại 👋</h2>

        <div className="grid gap-md grid-cols-2 lg:grid-cols-4 mb-xl">
          <StatCard icon="assignment" label="Việc đang mở" value={stats?.openTasks ?? "–"} tint="bg-primary-container/10 text-primary" />
          <StatCard icon="event_upcoming" label="Sắp đến hạn (7 ngày)" value={stats?.dueSoon ?? "–"} tint="bg-tertiary-fixed text-tertiary" />
          <StatCard icon="folder_open" label="Dự án" value={stats?.projectCount ?? "–"} tint="bg-success-container text-success" />
          <StatCard icon="schedule" label="Giờ tuần này" value={stats ? `${stats.hoursThisWeek.toFixed(1)}h` : "–"} tint="bg-surface-container-high text-on-surface-variant" />
        </div>

        <div className="flex items-center justify-between mb-md">
          <h3 className="text-headline-md">Không gian làm việc</h3>
        </div>

        <form onSubmit={createWorkspace} className="flex gap-sm mb-lg max-w-lg">
          <input className="field" placeholder="Tên workspace mới…" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn-primary whitespace-nowrap" disabled={!newName.trim()}>
            <Icon name="add" size={20} /> Tạo
          </button>
        </form>
        {error && <p className="text-error text-body-sm mb-md">{error}</p>}

        <div className="grid gap-md grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {workspaces.map((ws) => (
            <Link key={ws.id} href={`/workspaces/${ws.id}`}>
              <div className="card p-lg hover:border-primary/40 hover:shadow-popover transition-all">
                <div className="flex items-center gap-md">
                  <div className="w-10 h-10 rounded-lg bg-primary-container/10 text-primary flex items-center justify-center">
                    <Icon name="workspaces" size={22} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-headline-md text-on-surface truncate">{ws.name}</p>
                    <p className="text-body-sm text-on-surface-variant">/{ws.slug}</p>
                  </div>
                </div>
              </div>
            </Link>
          ))}
          {workspaces.length === 0 && (
            <div className="card p-xl text-center text-on-surface-variant col-span-full">
              <Icon name="workspaces" size={40} className="text-outline mb-sm" />
              <p>Chưa có workspace nào. Tạo cái đầu tiên ở trên.</p>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
