"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, CriticalPath, Project, Task } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import ProjectTabs from "@/components/layout/ProjectTabs";
import TaskDrawer from "@/components/task/TaskDrawer";
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
  const [cpm, setCpm] = useState<CriticalPath | null>(null);
  const [showCritical, setShowCritical] = useState(true);

  const reload = useCallback(() => {
    api.listTasks(id).then(setTasks).catch(() => {});
    api.criticalPath(id).then(setCpm).catch(() => setCpm(null));
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

        <div className="flex flex-wrap items-center justify-between gap-md mb-lg">
          <h2 className="text-headline-md">Timeline (Gantt)</h2>
          {cpm && cpm.items.length > 0 && (
            <div className="flex items-center gap-md">
              <span className="text-body-sm text-on-surface-variant">
                Đường găng: <b className="text-on-surface">{cpm.criticalTaskIds.length}</b> việc ·
                dự kiến <b className="text-on-surface">{cpm.projectDurationDays}</b> ngày
              </span>
              <button
                onClick={() => setShowCritical((v) => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-semibold border shadow-sm transition-colors ${
                  showCritical
                    ? "bg-red-50 border-red-200 text-red-600"
                    : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                }`}
                title="Tô đỏ các công việc không có thời gian trễ (slack = 0)"
              >
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Critical Path
              </button>
            </div>
          )}
        </div>

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
                const cpItem = cpm?.items.find((i) => i.taskId === t.id);
                const isCritical = showCritical && !!cpItem?.critical;
                return (
                  <div key={t.id} className="flex items-center border-b border-outline-variant/50 hover:bg-surface-container-low">
                    <button
                      className="w-60 flex-shrink-0 px-md py-2 text-left text-body-sm truncate border-r border-outline-variant flex items-center gap-1.5"
                      onClick={() => setOpenTask(t.id)}
                    >
                      {isCritical && (
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" title="Trên đường găng" />
                      )}
                      <span className="truncate">{t.title}</span>
                    </button>
                    <div className="relative flex-grow h-9" style={{ width: totalDays * DAY }}>
                      <button
                        onClick={() => setOpenTask(t.id)}
                        className={`absolute top-1.5 h-6 rounded-md flex items-center px-2 transition-all ${
                          isCritical
                            ? "bg-red-500 ring-2 ring-red-300"
                            : `${st.dot} opacity-90 hover:opacity-100`
                        }`}
                        style={{
                          left: offset * DAY,
                          width: len * DAY - 4,
                          // Custom columns carry arbitrary hex, which Tailwind
                          // cannot express as a class — fill the bar inline.
                          ...(isCritical || !st.hex ? {} : { backgroundColor: st.hex }),
                        }}
                        title={
                          cpItem
                            ? `${t.title}\nThời lượng ${cpItem.duration} ngày · slack ${cpItem.slack} ngày${cpItem.critical ? " (đường găng)" : ""}`
                            : t.title
                        }
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
