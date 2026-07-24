"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Project, Workspace } from "@/lib/api";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";

interface Group {
  workspace: Workspace;
  projects: Project[];
}

export default function ProjectsPage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const wss = await api.listWorkspaces().catch(() => []);
      const g = await Promise.all(
        wss.map(async (workspace) => ({
          workspace,
          projects: await api.listProjects(workspace.id).catch(() => []),
        })),
      );
      setGroups(g);
      setLoading(false);
    })();
  }, []);

  return (
    <AppShell title="Projects">
      <div className="p-lg max-w-6xl">
        {loading && <p className="text-on-surface-variant">Đang tải…</p>}
        {!loading && groups.length === 0 && (
          <div className="card p-xl text-center text-on-surface-variant">
            Chưa có workspace/dự án nào.{" "}
            <Link href="/" className="text-primary">Tạo tại Dashboard</Link>.
          </div>
        )}
        {groups.map((g) => (
          <section key={g.workspace.id} className="mb-xl">
            <div className="flex items-center gap-sm mb-md">
              <Icon name="workspaces" size={20} className="text-on-surface-variant" />
              <Link href={`/workspaces/${g.workspace.id}`} className="text-headline-md hover:text-primary">
                {g.workspace.name}
              </Link>
              <span className="chip bg-surface-container-high text-on-surface-variant">
                {g.projects.length}
              </span>
            </div>
            <div className="grid gap-md grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {g.projects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`}>
                  <div className="card p-lg hover:border-primary/40 hover:shadow-popover transition-all h-full">
                    <span className="chip bg-primary-container/10 text-primary">{p.key}</span>
                    <p className="text-headline-md text-on-surface mt-sm">{p.name}</p>
                    <p className="text-body-sm text-on-surface-variant mt-1 line-clamp-2">
                      {p.description || "Không có mô tả"}
                    </p>
                  </div>
                </Link>
              ))}
              {g.projects.length === 0 && (
                <Link href={`/workspaces/${g.workspace.id}`} className="card p-lg text-on-surface-variant hover:border-primary/40 border-dashed flex items-center gap-sm">
                  <Icon name="add" size={20} /> Tạo dự án đầu tiên
                </Link>
              )}
            </div>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
