"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, Project, Task } from "@/lib/api";
import AppShell from "@/components/AppShell";
import ProjectTabs from "@/components/ProjectTabs";
import TaskDrawer from "@/components/TaskDrawer";
import { statusByKey } from "@/lib/status";

const DAY = 34; // px per day

function dOnly(s?: string) {
  return s ? new Date(s.slice(0, 10)) : null;
}
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

export default function TimelinePage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openTask, setOpenTask] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.listTasks(id).then(setTasks).catch(() => {});
  }, [id]);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    reload();
  }, [id, reload]);

  const scheduled = useMemo(
    () => tasks.filter((t) => t.startDate || t.dueDate),
    [tasks],
  );

  const { spanStart, totalDays, cols } = useMemo(() => {
    if (scheduled.length === 0) return { spanStart: new Date(), totalDays: 0, cols: [] as Date[] };
    let min = Infinity, max = -Infinity;
    for (const t of scheduled) {
      const s = dOnly(t.startDate) ?? dOnly(t.dueDate)!;
      const e = dOnly(t.dueDate) ?? dOnly(t.startDate)!;
      min = Math.min(min, s.getTime());
      max = Math.max(max, e.getTime());
    }
    const start = new Date(min);
    start.setDate(start.getDate() - 2);
    const end = new Date(max);
    end.setDate(end.getDate() + 2);
    const total = daysBetween(start, end) + 1;
    const c = Array.from({ length: total }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
    return { spanStart: start, totalDays: total, cols: c };
  }, [scheduled]);

  const today = new Date();

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
        <h2 className="text-headline-md mb-lg">Timeline (Gantt)</h2>

        {scheduled.length === 0 ? (
          <div className="card p-xl text-center text-on-surface-variant">
            Chưa có task nào có ngày bắt đầu/hạn. Mở một task và đặt ngày để hiển thị trên timeline.
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <div style={{ minWidth: 240 + totalDays * DAY }}>
              {/* Header: days */}
              <div className="flex border-b border-outline-variant sticky top-0 bg-surface-container-lowest">
                <div className="w-60 flex-shrink-0 px-md py-2 text-label-md text-on-surface-variant border-r border-outline-variant">
                  Công việc
                </div>
                <div className="flex">
                  {cols.map((d, i) => (
                    <div
                      key={i}
                      className={`text-center text-label-sm py-2 border-r border-outline-variant/40 ${
                        d.getDay() === 0 || d.getDay() === 6 ? "bg-surface-container-low/60" : ""
                      }`}
                      style={{ width: DAY }}
                    >
                      <div className={d.toDateString() === today.toDateString() ? "text-primary font-semibold" : "text-on-surface-variant"}>
                        {d.getDate()}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {/* Rows */}
              {scheduled.map((t) => {
                const s = dOnly(t.startDate) ?? dOnly(t.dueDate)!;
                const e = dOnly(t.dueDate) ?? dOnly(t.startDate)!;
                const offset = daysBetween(spanStart, s);
                const len = Math.max(1, daysBetween(s, e) + 1);
                const st = statusByKey(t.status);
                return (
                  <div key={t.id} className="flex items-center border-b border-outline-variant/50 hover:bg-surface-container-low">
                    <button
                      className="w-60 flex-shrink-0 px-md py-2 text-left text-body-sm truncate border-r border-outline-variant"
                      onClick={() => setOpenTask(t.id)}
                    >
                      {t.title}
                    </button>
                    <div className="relative flex-grow h-9" style={{ width: totalDays * DAY }}>
                      <button
                        onClick={() => setOpenTask(t.id)}
                        className={`absolute top-1.5 h-6 rounded-md ${st.dot} opacity-90 hover:opacity-100 flex items-center px-2`}
                        style={{ left: offset * DAY, width: len * DAY - 4 }}
                        title={`${t.title}`}
                      >
                        <span className="text-on-primary text-label-sm truncate">{t.title}</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={reload} />}
    </AppShell>
  );
}
