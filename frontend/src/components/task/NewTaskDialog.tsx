"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Member, Project } from "@/lib/api";
import { PRIORITIES } from "@/lib/status";

/**
 * Workspace-level task creation.
 *
 * The board can only add a task to the column you're looking at, so there was
 * no way to capture work from the dashboard. This picks the project first.
 */
export default function NewTaskDialog({
  workspaceId,
  defaultProjectId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  defaultProjectId?: string;
  onClose: () => void;
  /** Omit to navigate to the project board after creating. */
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listProjects(workspaceId).then((ps) => {
      setProjects(ps);
      setProjectId((cur) => cur || ps[0]?.id || "");
    }).catch(() => {});
    api.listMembers(workspaceId).then(setMembers).catch(() => setMembers([]));
  }, [workspaceId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const t = await api.createTask(projectId, {
        title: title.trim(),
        priority,
        assigneeId: assigneeId || undefined,
      });
      // Due date isn't part of the create payload, so patch it afterwards.
      if (dueDate) await api.updateTask(t.id, { dueDate });
      if (onCreated) onCreated();
      else router.push(`/projects/${projectId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-md" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="card shadow-modal p-lg w-full max-w-md">
        <h3 className="text-headline-lg text-on-surface mb-md">Công việc mới</h3>

        <label className="block text-label-md text-on-surface-variant mb-1">Dự án</label>
        <select className="field mb-md" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.length === 0 && <option value="">Chưa có dự án nào</option>}
          {projects.map((p) => (<option key={p.id} value={p.id}>{p.key} · {p.name}</option>))}
        </select>

        <label className="block text-label-md text-on-surface-variant mb-1">Tiêu đề</label>
        <input
          className="field mb-md"
          placeholder="Rà soát bản thiết kế trang chủ"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />

        <div className="grid grid-cols-2 gap-md mb-lg">
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Độ ưu tiên</label>
            <select className="field" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {Object.entries(PRIORITIES).map(([key, p]) => (
                <option key={key} value={key}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Hạn chót</label>
            <input type="date" className="field" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="col-span-2">
            <label className="block text-label-md text-on-surface-variant mb-1">Người thực hiện</label>
            <select className="field" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Chưa giao</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>
              ))}
            </select>
          </div>
        </div>

        {error && <p className="text-error text-body-sm mb-md">{error}</p>}

        <div className="flex justify-end gap-sm">
          <button type="button" className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={busy || !title.trim() || !projectId}>
            {busy ? "Đang tạo…" : "Tạo công việc"}
          </button>
        </div>
      </form>
    </div>
  );
}
