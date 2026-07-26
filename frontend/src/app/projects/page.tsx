"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ProjectSummary, WorkspaceOverview } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import NewProjectDialog from "@/components/project/NewProjectDialog";
import { useWorkspace } from "@/lib/useWorkspace";
import { money } from "@/lib/format";

/**
 * Project directory.
 *
 * Cards show live progress (from the workspace overview) rather than just a
 * name, and link straight into the project's Overview tab so the destination is
 * the same whether you arrive from here or from the dashboard table.
 */
export default function ProjectsPage() {
  const { workspaces, workspace, workspaceId, setWorkspaceId, loading } = useWorkspace();
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    if (!workspaceId) return;
    api.workspaceOverview(workspaceId).then(setOverview).catch(() => setOverview(null));
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  const projects = (overview?.projects ?? []).filter((p) =>
    query ? (p.name + p.key).toLowerCase().includes(query.toLowerCase()) : true,
  );

  const actions = (
    <div className="flex items-center gap-sm">
      {workspaces.length > 1 && (
        <select
          className="field w-auto"
          value={workspaceId}
          onChange={(e) => setWorkspaceId(e.target.value)}
        >
          {workspaces.map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
        </select>
      )}
      <button className="btn-primary" onClick={() => setOpen(true)} disabled={!workspaceId}>
        <Icon name="add" size={18} /> Dự án mới
      </button>
    </div>
  );

  return (
    <AppShell title="Dự án" actions={actions}>
      <div className="p-lg max-w-[1400px]">
        {loading && <p className="text-on-surface-variant">Đang tải…</p>}

        {!loading && !workspace && (
          <EmptyWorkspace />
        )}

        {!loading && workspace && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-md mb-lg">
              <div className="flex items-center gap-2 text-body-sm text-on-surface-variant">
                <Icon name="workspaces" size={18} />
                <span>{workspace.name}</span>
                <span className="chip bg-surface-container-high text-on-surface-variant">
                  {overview?.projects.length ?? 0} dự án
                </span>
              </div>
              <input
                className="field w-64"
                placeholder="Tìm dự án…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div className="grid gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3">
              {projects.map((p) => <ProjectCard key={p.projectId} p={p} />)}

              {/* Creating a project is a first-class card, not a hidden button. */}
              <button
                onClick={() => setOpen(true)}
                className="border border-dashed border-outline-variant rounded-lg p-6 flex flex-col items-center justify-center gap-2 text-on-surface-variant hover:border-primary hover:text-primary transition-colors min-h-[168px]"
              >
                <Icon name="add_circle" size={28} />
                <span className="text-body-md font-medium">Tạo dự án mới</span>
              </button>
            </div>
          </>
        )}
      </div>

      {open && workspaceId && (
        <NewProjectDialog
          workspaceId={workspaceId}
          onClose={() => setOpen(false)}
          onCreated={() => { setOpen(false); load(); }}
        />
      )}
    </AppShell>
  );
}

function ProjectCard({ p }: { p: ProjectSummary }) {
  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <Link href={`/projects/${p.projectId}`} className="block">
      <div className="card p-5 hover:border-primary/40 hover:shadow-md transition-all h-full">
        <div className="flex items-center justify-between mb-3">
          <span className="chip bg-primary-container/10 text-primary">{p.key}</span>
          {p.overdue > 0 && (
            <span className="chip bg-error-container text-on-error-container">
              {p.overdue} quá hạn
            </span>
          )}
        </div>

        <p className="text-[17px] font-bold text-on-surface mb-3 truncate">{p.name}</p>

        <div className="flex items-center gap-2 mb-3">
          <div className="flex-grow bg-surface-container-high rounded-full h-2 overflow-hidden">
            <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-[12px] font-semibold text-on-surface-variant w-9 text-right">{pct}%</span>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-body-sm text-on-surface-variant">
          <span>{p.done}/{p.total} việc</span>
          <span>{p.inProgress} đang làm</span>
          <span>{p.hoursLogged.toFixed(1)}h</span>
          {p.costActual > 0 && <span>{money(p.costActual)}</span>}
        </div>
      </div>
    </Link>
  );
}

function EmptyWorkspace() {
  return (
    <div className="card p-xl text-center text-on-surface-variant">
      <Icon name="workspaces" size={40} className="text-outline mb-sm" />
      <p className="text-body-lg font-medium text-on-surface">Chưa có không gian làm việc</p>
      <p className="text-body-sm mt-1">
        Bạn chưa thuộc workspace nào. Liên hệ quản trị viên để được thêm vào.
      </p>
    </div>
  );
}
