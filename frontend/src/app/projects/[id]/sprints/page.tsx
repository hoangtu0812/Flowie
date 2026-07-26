"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { api, Project, Sprint, Task } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import ProjectTabs from "@/components/layout/ProjectTabs";
import TaskDrawer from "@/components/task/TaskDrawer";
import { PRIORITIES } from "@/lib/status";

const STATE_STYLE: Record<string, string> = {
  planned: "bg-surface-container-high text-on-surface-variant",
  active: "bg-blue-50 text-blue-600",
  completed: "bg-green-50 text-green-600",
};
const STATE_LABEL: Record<string, string> = {
  planned: "Chưa bắt đầu",
  active: "Đang chạy",
  completed: "Đã kết thúc",
};

export default function SprintPlanningPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Tasks ticked in the backlog, for moving a batch into a sprint at once. */
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const reload = useCallback(async () => {
    setSprints(await api.listSprints(id).catch(() => []));
    setTasks(await api.listTasks(id).catch(() => []));
  }, [id]);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    reload();
  }, [id, reload]);

  const points = (list: Task[]) => list.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  const backlog = useMemo(() => tasks.filter((t) => !t.sprintId), [tasks]);

  async function setState(s: Sprint, state: string) {
    await api.updateSprint(s.id, { state }).catch((e) => setError(e.message));
    reload();
  }
  async function moveTask(t: Task, sprintId: string | null) {
    await api.setTaskSprint(t.id, sprintId).catch((e) => setError(e.message));
    reload();
  }
  async function setPoints(t: Task, sp: number) {
    await api.updateTask(t.id, { storyPoints: sp }).catch((e) => setError(e.message));
    reload();
  }

  /** Moves every ticked backlog task into one sprint. */
  async function moveSelected(sprintId: string) {
    const ids = [...picked];
    if (ids.length === 0) return;
    await Promise.all(ids.map((tid) => api.setTaskSprint(tid, sprintId)))
      .catch((e) => setError((e as Error).message));
    setPicked(new Set());
    reload();
  }

  function togglePick(taskId: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  const actions = (
    <button className="btn-primary" onClick={() => setCreating(true)}>
      <Icon name="add" size={20} /> Sprint mới
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
      <div className="p-lg">
        {project && <ProjectTabs projectId={id} />}

        <div className="max-w-7xl">
          <div className="flex items-baseline justify-between mb-lg">
            <h2 className="text-headline-md">Lập kế hoạch Sprint</h2>
            <p className="text-body-sm text-on-surface-variant">
              {sprints.length} sprint · {backlog.length} việc trong backlog
            </p>
          </div>

          {error && <p className="text-error text-body-sm mb-md">{error}</p>}

          {sprints.length === 0 && !creating && (
            <div className="card p-xl text-center text-on-surface-variant mb-lg">
              <Icon name="sprint" size={40} className="text-outline mb-sm" />
              <p className="text-body-lg font-medium text-on-surface">Chưa có sprint nào</p>
              <p className="text-body-sm mt-1 mb-md">
                Mọi công việc đang nằm ở backlog. Tạo sprint đầu tiên rồi kéo việc vào.
              </p>
              <button className="btn-primary mx-auto" onClick={() => setCreating(true)}>
                <Icon name="add" size={18} /> Tạo sprint đầu tiên
              </button>
            </div>
          )}

          <div className="flex flex-col gap-lg">
            {sprints.map((s) => {
              const items = tasks.filter((t) => t.sprintId === s.id);
              return (
                <SprintSection
                  key={s.id}
                  sprint={s}
                  count={items.length}
                  pts={points(items)}
                  onState={(st) => setState(s, st)}
                  onRename={async (name, goal) => {
                    await api.updateSprint(s.id, { name, goal }).catch((e) => setError(e.message));
                    reload();
                  }}
                  onDates={async (startDate, endDate) => {
                    await api.updateSprint(s.id, { startDate, endDate }).catch((e) => setError(e.message));
                    reload();
                  }}
                >
                  <TaskRows
                    items={items}
                    sprints={sprints}
                    onOpen={setOpenTask}
                    onMove={moveTask}
                    onPoints={setPoints}
                  />
                </SprintSection>
              );
            })}

            {/* Backlog */}
            <section>
              <div className="flex flex-wrap justify-between items-center gap-sm mb-sm">
                <div className="flex items-center gap-sm">
                  <span className="chip bg-surface-container-high text-on-surface-variant">Backlog</span>
                  <span className="text-body-sm text-on-surface-variant">
                    {backlog.length} việc · {points(backlog)} pts
                  </span>
                </div>
                {picked.size > 0 && sprints.length > 0 && (
                  <div className="flex items-center gap-sm">
                    <span className="text-body-sm text-on-surface-variant">Đã chọn {picked.size}</span>
                    <select
                      className="field w-auto"
                      defaultValue=""
                      onChange={(e) => { if (e.target.value) moveSelected(e.target.value); }}
                    >
                      <option value="">Chuyển vào sprint…</option>
                      {sprints.filter((s) => s.state !== "completed").map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <button className="btn-ghost" onClick={() => setPicked(new Set())}>Bỏ chọn</button>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <TaskRows
                  items={backlog}
                  sprints={sprints}
                  onOpen={setOpenTask}
                  onMove={moveTask}
                  onPoints={setPoints}
                  backlog
                  picked={picked}
                  onPick={togglePick}
                />
              </div>
            </section>
          </div>
        </div>
      </div>

      {creating && (
        <NewSprintDialog
          projectId={id}
          suggestedName={`Sprint ${sprints.length + 1}`}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); reload(); }}
        />
      )}
      {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={reload} />}
    </AppShell>
  );
}

/** Creation form. Defaults to a two-week sprint starting today. */
function NewSprintDialog({
  projectId, suggestedName, onClose, onCreated,
}: {
  projectId: string;
  suggestedName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const plus = (days: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + days);
    return iso(d);
  };

  const [name, setName] = useState(suggestedName);
  const [goal, setGoal] = useState("");
  const [startDate, setStartDate] = useState(iso(today));
  const [endDate, setEndDate] = useState(plus(13)); // 2 tuần, tính cả ngày đầu
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createSprint(projectId, name.trim(), goal.trim(), { startDate, endDate });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-md" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={submit} className="card shadow-modal p-lg w-full max-w-md">
        <h3 className="text-headline-lg text-on-surface mb-md">Sprint mới</h3>

        <label className="block text-label-md text-on-surface-variant mb-1">Tên sprint</label>
        <input className="field mb-md" value={name} onChange={(e) => setName(e.target.value)} autoFocus />

        <label className="block text-label-md text-on-surface-variant mb-1">Mục tiêu</label>
        <textarea
          className="field mb-md"
          rows={2}
          placeholder="Hoàn thiện luồng đăng nhập"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-md mb-lg">
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Bắt đầu</label>
            <input type="date" className="field" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Kết thúc</label>
            <input type="date" className="field" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>

        {error && <p className="text-error text-body-sm mb-md">{error}</p>}

        <div className="flex justify-end gap-sm">
          <button type="button" className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={busy || !name.trim()}>
            {busy ? "Đang tạo…" : "Tạo sprint"}
          </button>
        </div>
      </form>
    </div>
  );
}

function SprintSection({
  sprint, count, pts, onState, onRename, onDates, children,
}: {
  sprint: Sprint;
  count: number;
  pts: number;
  onState: (state: string) => void;
  onRename: (name: string, goal: string) => void;
  onDates: (startDate: string, endDate: string) => void;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(sprint.name);
  const [goal, setGoal] = useState(sprint.goal ?? "");
  const [start, setStart] = useState(sprint.startDate?.slice(0, 10) ?? "");
  const [end, setEnd] = useState(sprint.endDate?.slice(0, 10) ?? "");

  const dateRange =
    sprint.startDate || sprint.endDate
      ? `${fmt(sprint.startDate)} → ${fmt(sprint.endDate)}`
      : "Chưa đặt lịch";

  return (
    <section className="card p-md">
      <div className="flex flex-wrap justify-between items-center gap-sm">
        <div className="flex items-center gap-sm min-w-0">
          <span className={`chip ${STATE_STYLE[sprint.state] ?? ""}`}>{STATE_LABEL[sprint.state] ?? sprint.state}</span>
          <span className="text-body-lg font-semibold text-on-surface truncate">{sprint.name}</span>
          <span className="text-body-sm text-on-surface-variant whitespace-nowrap">
            {count} việc · {pts} pts · {dateRange}
          </span>
        </div>
        <div className="flex items-center gap-sm text-on-surface-variant">
          {sprint.state === "planned" && (
            <button className="btn-ghost" onClick={() => onState("active")}>
              <Icon name="play_arrow" size={18} /> Bắt đầu
            </button>
          )}
          {sprint.state === "active" && (
            <button className="btn-ghost" onClick={() => onState("completed")}>
              <Icon name="flag" size={18} /> Kết thúc
            </button>
          )}
          <button className="hover:text-on-surface" title="Sửa" onClick={() => setEditing((v) => !v)}>
            <Icon name="edit" size={20} />
          </button>
          <button onClick={() => setOpen((o) => !o)} className="hover:text-on-surface">
            <Icon name={open ? "expand_less" : "expand_more"} size={22} />
          </button>
        </div>
      </div>

      {sprint.goal && !editing && (
        <p className="text-body-sm text-on-surface-variant mt-1">🎯 {sprint.goal}</p>
      )}

      {editing && (
        <div className="mt-md grid gap-sm sm:grid-cols-2">
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên sprint" />
          <input className="field" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Mục tiêu" />
          <input type="date" className="field" value={start} onChange={(e) => setStart(e.target.value)} />
          <input type="date" className="field" value={end} min={start} onChange={(e) => setEnd(e.target.value)} />
          <div className="sm:col-span-2 flex justify-end gap-sm">
            <button className="btn-ghost" onClick={() => setEditing(false)}>Huỷ</button>
            <button
              className="btn-primary"
              onClick={() => {
                onRename(name.trim(), goal.trim());
                if (start !== (sprint.startDate?.slice(0, 10) ?? "") || end !== (sprint.endDate?.slice(0, 10) ?? "")) {
                  onDates(start, end);
                }
                setEditing(false);
              }}
            >
              Lưu
            </button>
          </div>
        </div>
      )}

      {open && <div className="flex flex-col gap-2 mt-md">{children}</div>}
    </section>
  );
}

function fmt(d?: string) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

function TaskRows({
  items, sprints, onOpen, onMove, onPoints, backlog, picked, onPick,
}: {
  items: Task[];
  sprints: Sprint[];
  onOpen: (id: string) => void;
  onMove: (t: Task, sprintId: string | null) => void;
  onPoints: (t: Task, sp: number) => void;
  backlog?: boolean;
  picked?: Set<string>;
  onPick?: (taskId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="text-body-sm text-on-surface-variant/60 border border-dashed border-outline-variant rounded-lg py-md text-center">
        {backlog ? "Backlog trống" : "Chưa có việc trong sprint này — chọn việc ở backlog rồi chuyển vào."}
      </div>
    );
  }
  const openSprints = sprints.filter((s) => s.state !== "completed");
  return (
    <>
      {items.map((t) => (
        <div
          key={t.id}
          className="group bg-surface-container-lowest border border-outline-variant rounded-lg p-3 flex items-center justify-between hover:shadow-sm transition-all"
        >
          <div className="flex items-center gap-md flex-1 min-w-0">
            {backlog && onPick ? (
              <input
                type="checkbox"
                checked={picked?.has(t.id) ?? false}
                onChange={() => onPick(t.id)}
                aria-label={`Chọn ${t.title}`}
              />
            ) : (
              <Icon name="drag_indicator" size={18} className="text-outline-variant" />
            )}
            <button className="text-body-md text-on-surface font-medium truncate text-left" onClick={() => onOpen(t.id)}>
              {t.title}
            </button>
            <span className={`chip ${PRIORITIES[t.priority]?.cls ?? ""}`}>
              {PRIORITIES[t.priority]?.label ?? t.priority}
            </span>
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
              disabled={openSprints.length === 0 && !t.sprintId}
              title={openSprints.length === 0 ? "Tạo sprint trước" : undefined}
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
