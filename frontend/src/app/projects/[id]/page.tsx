"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { api, Project, Task, User } from "@/lib/api";
import TopBar from "@/components/TopBar";

const COLUMNS: { key: string; label: string }[] = [
  { key: "todo", label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "in_review", label: "In Review" },
  { key: "done", label: "Done" },
];

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setUser(await api.me());
        setProject(await api.getProject(id));
        setTasks(await api.listTasks(id));
      } catch (err) {
        setError((err as Error).message);
      }
    })();
  }, [id]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const t = await api.createTask(id, { title: newTitle.trim() });
      setTasks((prev) => [...prev, t]);
      setNewTitle("");
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function move(task: Task, status: string) {
    const updated = await api.updateTaskStatus(task.id, status);
    setTasks((prev) => prev.map((t) => (t.id === task.id ? updated : t)));
  }

  return (
    <>
      <TopBar user={user} />
      <div className="container" style={{ maxWidth: 1300 }}>
        <Link href={project ? `/workspaces/${project.workspaceId}` : "/"} className="muted">
          ← Dự án
        </Link>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2>
            {project?.name || "…"}{" "}
            {project && <span className="badge">{project.key}</span>}
          </h2>
        </div>

        <form onSubmit={addTask} className="row" style={{ maxWidth: 480, marginBottom: 20 }}>
          <input
            placeholder="Thêm công việc…"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <button disabled={!newTitle.trim()}>Thêm</button>
        </form>
        {error && <p style={{ color: "var(--danger)" }}>{error}</p>}

        <div className="kanban">
          {COLUMNS.map((col) => {
            const items = tasks.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="kanban-col">
                <h3>
                  {col.label} ({items.length})
                </h3>
                {items.map((t) => (
                  <div key={t.id} className="task-card">
                    <div>{t.title}</div>
                    <div className="row" style={{ justifyContent: "space-between", marginTop: 8 }}>
                      <span className={`badge ${t.priority === "high" ? "high" : ""}`}>
                        {t.priority}
                      </span>
                      <select
                        value={t.status}
                        onChange={(e) => move(t, e.target.value)}
                        style={{ width: "auto", padding: "2px 6px" }}
                      >
                        {COLUMNS.map((c) => (
                          <option key={c.key} value={c.key}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
