"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Project, Workspace } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";

interface Group {
  workspace: Workspace;
  projects: Project[];
}

export default function ProjectsPage() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  
  // For creating project
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", key: "", description: "" });
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const wsId = localStorage.getItem('activeWorkspaceId');
    if (wsId) {
      api.getWorkspace(wsId)
        .then(async (ws) => {
          setWorkspace(ws);
          const ps = await api.listProjects(wsId).catch(() => []);
          setProjects(ps);
          setLoading(false);
        })
        .catch(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, []);

  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    setError(null);
    setIsCreating(true);
    try {
      const p = await api.createProject(workspace.id, {
        name: form.name.trim(),
        key: form.key.trim().toUpperCase(),
        description: form.description.trim(),
      });
      setProjects((prev) => [p, ...prev]);
      setForm({ name: "", key: "", description: "" });
      setOpen(false);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsCreating(false);
    }
  }

  return (
    <AppShell title="Projects">
      <div className="p-lg max-w-6xl mx-auto mt-8">
        {loading && <p className="text-gray-500">Đang tải…</p>}
        
        {!loading && !workspace && (
          <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-10 text-center text-gray-500">
            <Icon name="workspaces" size={40} className="text-gray-300 mb-3 mx-auto" />
            <p className="text-[15px] font-medium">Vui lòng chọn Không gian làm việc từ menu trên cùng để xem danh sách dự án.</p>
          </div>
        )}

        {!loading && workspace && (
          <section className="mb-xl">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <Icon name="folder" size={24} className="text-gray-700" />
                <h2 className="text-[24px] font-bold text-gray-900">Dự án thuộc {workspace.name}</h2>
                <span className="bg-gray-100 text-gray-600 px-2.5 py-0.5 rounded-full text-[13px] font-bold">
                  {projects.length}
                </span>
              </div>
              <button 
                onClick={() => setOpen(true)}
                className="px-4 py-2 bg-gray-900 text-white rounded-lg text-[13px] font-semibold hover:bg-black transition-colors flex items-center gap-2 shadow-sm"
              >
                <Icon name="add" size={18} />
                Quản lý / Tạo mới
              </button>
            </div>
            
            <div className="grid gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`}>
                  <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-gray-300 transition-all h-full cursor-pointer group">
                    <div className="flex justify-between items-start mb-4">
                      <span className="px-2 py-1 bg-gray-100 text-gray-700 text-[12px] font-bold rounded">
                        {p.key}
                      </span>
                    </div>
                    <p className="text-[18px] font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">{p.name}</p>
                    <p className="text-[14px] text-gray-500 line-clamp-2">
                      {p.description || "Không có mô tả"}
                    </p>
                  </div>
                </Link>
              ))}
              {projects.length === 0 && (
                <div className="bg-gray-50 border border-dashed border-gray-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center text-gray-500 h-full min-h-[200px]">
                  <Icon name="add" size={32} className="text-gray-300 mb-2" /> 
                  <p className="text-[14px] font-medium">Chưa có dự án nào</p>
                </div>
              )}
            </div>
          </section>
        )}
      </div>

      {/* Create Project Modal */}
      {open && workspace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={() => setOpen(false)}>
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={createProject}
            className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md transform transition-all"
          >
            <h3 className="text-[22px] font-bold text-gray-900 mb-6">Tạo dự án mới</h3>
            {error && <p className="text-red-500 text-[13px] mb-4 bg-red-50 p-3 rounded-lg border border-red-100">{error}</p>}
            
            <div className="mb-4">
              <label className="block text-[13px] font-bold text-gray-700 mb-1.5">Tên dự án</label>
              <input
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
                placeholder="Ví dụ: Website Revamp"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </div>
            
            <div className="mb-4">
              <label className="block text-[13px] font-bold text-gray-700 mb-1.5">Mã dự án (KEY)</label>
              <input
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm uppercase"
                placeholder="Ví dụ: WEB"
                value={form.key}
                onChange={(e) => setForm({ ...form, key: e.target.value })}
              />
            </div>
            
            <div className="mb-8">
              <label className="block text-[13px] font-bold text-gray-700 mb-1.5">Mô tả chi tiết</label>
              <textarea
                className="w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-[14px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm resize-none"
                rows={3}
                placeholder="Tuỳ chọn"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            
            <div className="flex justify-end gap-3">
              <button 
                type="button" 
                className="px-5 py-2.5 text-gray-500 font-bold text-[14px] hover:bg-gray-100 rounded-xl transition-colors" 
                onClick={() => setOpen(false)}
              >
                Huỷ
              </button>
              <button 
                type="submit"
                disabled={!form.name.trim() || !form.key.trim() || isCreating}
                className="px-5 py-2.5 bg-gray-900 text-white font-bold text-[14px] rounded-xl hover:bg-black transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isCreating ? (
                  <>
                    <Icon name="sync" size={16} className="animate-spin" />
                    Đang tạo...
                  </>
                ) : (
                  "Tạo dự án"
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </AppShell>
  );
}
