"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, Project, User, Workspace } from "@/lib/api";
import TopBar from "@/components/TopBar";

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [ws, setWs] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [form, setForm] = useState({ name: "", key: "", description: "" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setUser(await api.me());
        setWs(await api.getWorkspace(id));
        setProjects(await api.listProjects(id));
      } catch (err) {
        setError((err as Error).message);
      }
    })();
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
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <>
      <TopBar user={user} />
      <div className="container">
        <Link href="/" className="muted">← Workspaces</Link>
        <h2>{ws?.name || "…"}</h2>

        <form onSubmit={createProject} className="card" style={{ maxWidth: 520, marginBottom: 20 }}>
          <strong>Dự án mới</strong>
          <div className="row" style={{ marginTop: 10 }}>
            <input
              placeholder="Tên dự án"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <input
              placeholder="KEY"
              style={{ maxWidth: 110 }}
              value={form.key}
              onChange={(e) => setForm({ ...form, key: e.target.value })}
            />
          </div>
          <textarea
            placeholder="Mô tả (tuỳ chọn)"
            style={{ marginTop: 10 }}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <div style={{ marginTop: 10 }}>
            <button disabled={!form.name.trim() || !form.key.trim()}>Tạo dự án</button>
          </div>
        </form>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

        <div className="grid">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`}>
              <div className="card">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <strong>{p.name}</strong>
                  <span className="badge">{p.key}</span>
                </div>
                <div className="muted" style={{ marginTop: 6 }}>
                  {p.description || "Không có mô tả"}
                </div>
              </div>
            </Link>
          ))}
          {projects.length === 0 && <p className="muted">Chưa có dự án nào.</p>}
        </div>
      </div>
    </>
  );
}
