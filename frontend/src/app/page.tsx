"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, User, Workspace } from "@/lib/api";
import TopBar from "@/components/TopBar";

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const u = await api.me();
        setUser(u);
        setWorkspaces(await api.listWorkspaces());
      } catch {
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const ws = await api.createWorkspace(newName.trim());
      setWorkspaces((prev) => [ws, ...prev]);
      setNewName("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) {
    return <div className="center-screen muted">Đang tải…</div>;
  }

  if (!user) {
    return (
      <div className="center-screen">
        <div className="card" style={{ width: 360, textAlign: "center" }}>
          <div className="brand" style={{ marginBottom: 8 }}>Flowie</div>
          <p className="muted" style={{ marginTop: 0 }}>
            Nền tảng quản lý dự án doanh nghiệp
          </p>
          <a href={api.loginUrl()}>
            <button style={{ width: "100%" }}>Đăng nhập với Microsoft</button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <>
      <TopBar user={user} />
      <div className="container">
        <h2>Không gian làm việc</h2>

        <form onSubmit={createWorkspace} className="row" style={{ marginBottom: 20, maxWidth: 480 }}>
          <input
            placeholder="Tên workspace mới…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <button disabled={!newName.trim()}>Tạo</button>
        </form>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

        <div className="grid">
          {workspaces.map((ws) => (
            <Link key={ws.id} href={`/workspaces/${ws.id}`}>
              <div className="card">
                <strong>{ws.name}</strong>
                <div className="muted" style={{ marginTop: 4 }}>/{ws.slug}</div>
              </div>
            </Link>
          ))}
          {workspaces.length === 0 && (
            <p className="muted">Chưa có workspace nào. Tạo cái đầu tiên ở trên.</p>
          )}
        </div>
      </div>
    </>
  );
}
