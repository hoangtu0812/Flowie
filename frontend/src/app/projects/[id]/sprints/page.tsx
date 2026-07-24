"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, Project, Sprint, Task } from "@/lib/api";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import ProjectTabs from "@/components/ProjectTabs";
import TaskDrawer from "@/components/TaskDrawer";
import { PRIORITIES } from "@/lib/status";

const STATE_STYLE: Record<string, string> = {
  planned: "bg-surface-container-high text-on-surface-variant",
  active: "bg-primary-fixed text-on-primary-fixed-variant",
  completed: "bg-success-container text-success",
};

export default function SprintPlanningPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openTask, setOpenTask] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setSprints(await api.listSprints(id).catch(() => []));
    setTasks(await api.listTasks(id).catch(() => []));
  }, [id]);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    reload();
  }, [id, reload]);

  const points = (list: Task[]) =>
    list.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);

  async function newSprint() {
    const n = sprints.length + 41; // playful default "Sprint 42"
    await api.createSprint(id, `Sprint ${n}`);
    reload();
  }
  async function setState(s: Sprint, state: string) {
    await api.updateSprint(s.id, { state });
    reload();
  }
  async function moveTask(t: Task, sprintId: string | null) {
    await api.setTaskSprint(t.id, sprintId);
    reload();
  }
  async function setPoints(t: Task, sp: number) {
    await api.updateTask(t.id, { storyPoints: sp });
    reload();
  }

  const backlog = tasks.filter((t) => !t.sprintId);

  const actions = (
    <button className="btn-primary" onClick={newSprint}>
      <Icon name="add" size={20} /> New Sprint
    </button>
  );

  return (
    <AppShell
      title={
        <div className="flex items-center gap-sm">
          {project && <span className="chip bg-primary-container/10 text-primary">{project.key}</span>}
          <span>{project?.name || "Project"}</span>
        </div>
      }
      actions={actions}
    >
      <div className="p-lg max-w-7xl">
        {project && <ProjectTabs projectId={id} />}
        <h2 className="text-headline-md mb-lg">Sprint Planning</h2>

        <div className="flex flex-col gap-lg">
          {sprints.map((s) => {
            const items = tasks.filter((t) => t.sprintId === s.id);
            return (
              <SprintSection
                key={s.id}
                title={
                  <div className="flex items-center gap-sm">
                    <span className={`chip ${STATE_STYLE[s.state]}`}>{s.name}</span>
                    <span className="text-body-sm text-on-surface-variant">{items.length} việc · {points(items)} pts</span>
                  </div>
                }
                right={
                  <select
                    value={s.state}
                    onChange={(e) => setState(s, e.target.value)}
                    className="text-body-sm border border-outline-variant rounded-md px-2 py-1 text-on-surface-variant"
                  >
                    <option value="planned">Planned</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                }
              >
                <TaskRows items={items} sprints={sprints} onOpen={setOpenTask} onMove={moveTask} onPoints={setPoints} />
              </SprintSection>
            );
          })}

          {/* Backlog */}
          <SprintSection
            title={
              <div className="flex items-center gap-sm">
                <span className="chip bg-surface-container-high text-on-surface-variant">Backlog</span>
                <span className="text-body-sm text-on-surface-variant">{backlog.length} việc · {points(backlog)} pts</span>
              </div>
            }
          >
            <TaskRows items={backlog} sprints={sprints} onOpen={setOpenTask} onMove={moveTask} onPoints={setPoints} backlog />
          </SprintSection>
        </div>
      </div>

      {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={reload} />}
    </AppShell>
  );
}

function SprintSection({ title, right, children }: {
  title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section>
      <div className="flex justify-between items-center mb-sm">
        {title}
        <div className="flex items-center gap-sm text-on-surface-variant">
          {right}
          <button onClick={() => setOpen((o) => !o)} className="hover:text-on-surface">
            <Icon name={open ? "expand_less" : "expand_more"} size={22} />
          </button>
        </div>
      </div>
      {open && <div className="flex flex-col gap-2">{children}</div>}
    </section>
  );
}

function TaskRows({ items, sprints, onOpen, onMove, onPoints, backlog }: {
  items: Task[]; sprints: Sprint[];
  onOpen: (id: string) => void;
  onMove: (t: Task, sprintId: string | null) => void;
  onPoints: (t: Task, sp: number) => void;
  backlog?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div className="text-body-sm text-on-surface-variant/60 border border-dashed border-outline-variant rounded-lg py-md text-center">
        {backlog ? "Backlog trống" : "Chưa có việc trong sprint này"}
      </div>
    );
  }
  return (
    <>
      {items.map((t) => (
        <div key={t.id} className="group bg-surface-container-lowest border border-outline-variant rounded-lg p-3 flex items-center justify-between hover:shadow-sm transition-all">
          <div className="flex items-center gap-md flex-1 min-w-0">
            <Icon name="drag_indicator" size={18} className="text-outline-variant cursor-grab" />
            <button className="text-body-md text-on-surface font-medium truncate text-left" onClick={() => onOpen(t.id)}>
              {t.title}
            </button>
            <span className={`chip ${PRIORITIES[t.priority]?.cls ?? ""}`}>{PRIORITIES[t.priority]?.label ?? t.priority}</span>
          </div>
          <div className="flex items-center gap-md text-on-surface-variant">
            <label className="flex items-center gap-xs text-label-md">
              <Icon name="data_usage" size={16} />
              <input
                type="number"
                min={0}
                defaultValue={t.storyPoints ?? 0}
                onBlur={(e) => {
                  const v = Number(e.target.value);
                  if (v !== (t.storyPoints ?? 0)) onPoints(t, v);
                }}
                className="w-12 bg-transparent border border-outline-variant rounded-md px-1 py-0.5 text-center"
              />
              pts
            </label>
            <select
              value={t.sprintId ?? ""}
              onChange={(e) => onMove(t, e.target.value || null)}
              className="text-body-sm border border-outline-variant rounded-md px-2 py-1"
            >
              <option value="">Backlog</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>
      ))}
    </>
  );
}
