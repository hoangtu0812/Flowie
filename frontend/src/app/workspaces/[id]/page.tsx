"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, Project, Workspace } from "@/lib/api";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState({ name: "", key: "", description: "" });
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getWorkspace(id).then(setWs).catch(() => {});
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
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const actions = (
    <button className="btn-primary" onClick={() => setOpen(true)}>
      <Icon name="add" size={20} />
      Dự án mới
    </button>
  );

  return (
    <AppShell title={ws?.name || "Workspace"} actions={actions}>
      <div className="p-lg max-w-6xl">
        <div className="flex items-center gap-xs text-body-sm text-on-surface-variant mb-lg">
          <Link href="/" className="hover:text-primary">Dashboard</Link>
          <Icon name="chevron_right" size={16} />
          <span className="text-on-surface">{ws?.name}</span>
        </div>

        {error && <p className="text-error text-body-sm mb-md">{error}</p>}

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
