"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, Member, Project, Task } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import ProjectTabs from "@/components/layout/ProjectTabs";
import TaskDrawer from "@/components/task/TaskDrawer";

const CAPACITY = 20; // story points/sprint (giả định)

export default function WorkloadPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [openTask, setOpenTask] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.listTasks(id).then(setTasks).catch(() => {});
  }, [id]);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    api.projectMembers(id).then(setMembers).catch(() => {});
    reload();
  }, [id, reload]);

  const rows = useMemo(() => {
    const open = tasks.filter((t) => t.status !== "done");
    const base = members.map((m) => ({
      name: m.displayName || m.email,
      userId: m.userId,
      tasks: open.filter((t) => t.assigneeId === m.userId),
    }));
    const unassigned = open.filter((t) => !t.assigneeId);
    if (unassigned.length > 0) {
      base.push({ name: "Chưa gán", userId: "", tasks: unassigned });
    }
    return base.map((r) => ({
      ...r,
      points: r.tasks.reduce((s, t) => s + (t.storyPoints ?? 0), 0),
    }));
  }, [tasks, members]);

  return (
    <AppShell
      title={
        <div className="flex items-center gap-sm">
          {project && <span className="chip bg-primary-container/10 text-primary">{project.key}</span>}
          <span>{project?.name || "Project"}</span>
        </div>
      }
    >
      <div className="p-lg">
        {project && <ProjectTabs projectId={id} />}
        <div className="max-w-5xl">
          <div className="flex items-center justify-between mb-lg">
          <h2 className="text-headline-md">Workload</h2>
          <span className="text-body-sm text-on-surface-variant">Capacity giả định: {CAPACITY} pts</span>
        </div>

        <div className="flex flex-col gap-md">
          {rows.map((r) => {
            const pct = Math.min(100, (r.points / CAPACITY) * 100);
            const over = r.points > CAPACITY;
            return (
              <div key={r.userId || "unassigned"} className="card p-lg">
                <div className="flex items-center justify-between mb-sm">
                  <div className="flex items-center gap-sm">
                    <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center text-label-sm">
                      {r.name.slice(0, 1).toUpperCase()}
                    </div>
                    <span className="text-body-md font-medium text-on-surface">{r.name}</span>
                    <span className="text-body-sm text-on-surface-variant">{r.tasks.length} việc</span>
                  </div>
                  <span className={`text-body-md font-semibold ${over ? "text-error" : "text-on-surface"}`}>
                    {r.points} / {CAPACITY} pts
                  </span>
                </div>
                <div className="bg-surface-container-high rounded-full h-2.5 overflow-hidden mb-md">
                  <div className={`h-full rounded-full ${over ? "bg-error" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="flex flex-wrap gap-1">
                  {r.tasks.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setOpenTask(t.id)}
                      className="chip bg-surface-container-high text-on-surface-variant hover:text-primary"
                    >
                      {t.title}{t.storyPoints ? ` · ${t.storyPoints}` : ""}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="card p-xl text-center text-on-surface-variant">Chưa có thành viên hoặc công việc.</div>
          )}
        </div>
      </div>
    </div>

    {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={reload} />}
    </AppShell>
  );
}
