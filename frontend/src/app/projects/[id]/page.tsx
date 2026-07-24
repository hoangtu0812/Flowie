"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, Member, Project, Task } from "@/lib/api";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import TaskDrawer from "@/components/TaskDrawer";
import ProjectTabs from "@/components/ProjectTabs";
import { STATUSES, PRIORITIES, labelColor } from "@/lib/status";

type View = "list" | "board";
type Members = Record<string, string>;

export default function ProjectBoardPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Members>({});
  const [view, setView] = useState<View>("list");
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [assignee, setAssignee] = useState("");

  const reload = useCallback(() => {
    api.listTasks(id).then(setTasks).catch(() => {});
  }, [id]);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    api.projectMembers(id).then((ms: Member[]) => {
      const map: Members = {};
      ms.forEach((m) => (map[m.userId] = m.displayName || m.email));
      setMembers(map);
    }).catch(() => {});
    reload();
  }, [id, reload]);

  const filtered = tasks.filter((t) =>
    (query ? t.title.toLowerCase().includes(query.toLowerCase()) : true) &&
    (assignee ? t.assigneeId === assignee : true),
  );

  async function addTask(status: string) {
    if (!draft.trim()) return;
    await api.createTask(id, { title: draft.trim(), status });
    setDraft("");
    setAdding(null);
    reload();
  }
  async function move(task: Task, status: string) {
    await api.updateTaskStatus(task.id, status);
    reload();
  }

  const actions = (
    <div className="flex bg-surface-container-low rounded-lg p-0.5">
      <button onClick={() => setView("list")} className={`p-1.5 rounded-md ${view === "list" ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}>
        <Icon name="list" size={20} />
      </button>
      <button onClick={() => setView("board")} className={`p-1.5 rounded-md ${view === "board" ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}>
        <Icon name="view_kanban" size={20} />
      </button>
    </div>
  );

  const title = (
    <div className="flex items-center gap-sm">
      {project && <span className="chip bg-primary-container/10 text-primary">{project.key}</span>}
      <span>{project?.name || "Project"}</span>
    </div>
  );

  const shared = { tasks: filtered, members, adding, draft, setDraft, setAdding, onAdd: addTask, onMove: move, onOpen: setOpenTask };

  return (
    <AppShell title={title} actions={actions}>
      <div className="p-lg">
        {project && <ProjectTabs projectId={id} />}

        {/* Toolbar (Image #1) */}
        <div className="flex flex-wrap items-center justify-between gap-sm mb-lg">
          <div className="flex items-center gap-sm">
            <div className="relative">
              <Icon name="search" size={18} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                className="bg-surface-container-low border border-outline-variant rounded-lg pl-9 pr-md py-1.5 text-body-sm w-56 outline-none focus:ring-2 focus:ring-primary/20"
                placeholder="Tìm công việc…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <select
              className="btn-ghost !py-1.5"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">Tất cả người phụ trách</option>
              {Object.entries(members).map(([uid, name]) => (
                <option key={uid} value={uid}>{name}</option>
              ))}
            </select>
          </div>
          <button className="btn-primary" onClick={() => { setView("list"); setDraft(""); setAdding(STATUSES[0].key); }}>
            <Icon name="add" size={18} /> Add Task
          </button>
        </div>

        {view === "list" ? <ListView {...shared} /> : <BoardView {...shared} />}
      </div>

      {openTask && (
        <TaskDrawer
          taskId={openTask}
          onClose={() => setOpenTask(null)}
          onChanged={reload}
        />
      )}
    </AppShell>
  );
}

interface ViewProps {
  tasks: Task[];
  members: Members;
  adding: string | null;
  draft: string;
  setDraft: (v: string) => void;
  setAdding: (v: string | null) => void;
  onAdd: (status: string) => void;
  onMove: (t: Task, status: string) => void;
  onOpen: (id: string) => void;
}

function CardMeta({ t }: { t: Task }) {
  return (
    <div className="flex items-center gap-md text-label-md text-on-surface-variant">
      {(t.checklistTotal ?? 0) > 0 && (
        <span className="flex items-center gap-1">
          <Icon name="check_box" size={16} /> {t.checklistDone}/{t.checklistTotal}
        </span>
      )}
      {(t.commentCount ?? 0) > 0 && (
        <span className="flex items-center gap-1">
          <Icon name="chat_bubble" size={15} /> {t.commentCount}
        </span>
      )}
      {(t.subtaskCount ?? 0) > 0 && (
        <span className="flex items-center gap-1">
          <Icon name="account_tree" size={15} /> {t.subtaskCount}
        </span>
      )}
      {t.dueDate && (
        <span className="flex items-center gap-1">
          <Icon name="schedule" size={15} /> {new Date(t.dueDate).toLocaleDateString()}
        </span>
      )}
    </div>
  );
}

function Labels({ t }: { t: Task }) {
  if (!t.labels || t.labels.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {t.labels.map((l) => (
        <span key={l.id} className={`chip ${labelColor(l.color)}`}>{l.name}</span>
      ))}
    </div>
  );
}

function AddRow({ statusKey, adding, draft, setDraft, setAdding, onAdd, variant }: {
  statusKey: string; adding: string | null; draft: string;
  setDraft: (v: string) => void; setAdding: (v: string | null) => void;
  onAdd: (s: string) => void; variant: "row" | "card";
}) {
  if (adding === statusKey) {
    return (
      <input
        autoFocus
        className={variant === "card" ? "field" : "flex-grow bg-transparent outline-none text-body-md px-md py-2.5"}
        placeholder="Tên công việc, Enter để lưu…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onAdd(statusKey);
          if (e.key === "Escape") setAdding(null);
        }}
        onBlur={() => (draft.trim() ? onAdd(statusKey) : setAdding(null))}
      />
    );
  }
  const cls =
    variant === "card"
      ? "w-full py-md border-2 border-dashed border-outline-variant/50 rounded-xl text-on-surface-variant hover:border-primary/40 hover:text-primary transition-all flex items-center justify-center gap-sm text-label-md"
      : "w-full text-left px-md py-2.5 text-body-md text-on-surface-variant hover:text-primary hover:bg-surface-container-low flex items-center gap-sm";
  return (
    <button onClick={() => { setDraft(""); setAdding(statusKey); }} className={cls}>
      <Icon name="add" size={18} /> Add Task
    </button>
  );
}

function ListView({ tasks, members, adding, draft, setDraft, setAdding, onAdd, onMove, onOpen }: ViewProps) {
  return (
    <div className="flex flex-col gap-lg max-w-6xl">
      {STATUSES.map((s) => {
        const items = tasks.filter((t) => t.status === s.key);
        return (
          <div key={s.key}>
            <div className="flex items-center gap-sm mb-sm">
              <span className={`chip ${s.chipBg} ${s.chipText}`}>{s.label}</span>
              <span className="text-body-sm text-on-surface-variant">{items.length}</span>
            </div>
            <div className="card divide-y divide-outline-variant overflow-hidden">
              {items.map((t) => (
                <div key={t.id} className="flex items-center gap-md px-md py-2.5 hover:bg-surface-container-low transition-colors">
                  <Icon name="drag_indicator" size={18} className="text-outline-variant cursor-grab" />
                  <input
                    type="checkbox"
                    checked={t.status === "done"}
                    onChange={() => onMove(t, t.status === "done" ? "todo" : "done")}
                    className="w-4 h-4 rounded accent-primary"
                  />
                  <button className="flex-grow text-left min-w-0" onClick={() => onOpen(t.id)}>
                    <span className="text-body-md text-on-surface truncate block">{t.title}</span>
                  </button>
                  <Labels t={t} />
                  <CardMeta t={t} />
                  {t.assigneeId && members[t.assigneeId] && (
                    <Avatar name={members[t.assigneeId]} size={26} />
                  )}
                  <span className={`chip ${PRIORITIES[t.priority]?.cls ?? ""}`}>
                    {PRIORITIES[t.priority]?.label ?? t.priority}
                  </span>
                  <select
                    value={t.status}
                    onChange={(e) => onMove(t, e.target.value)}
                    className="text-body-sm bg-transparent border border-outline-variant rounded-md px-2 py-1 text-on-surface-variant"
                  >
                    {STATUSES.map((x) => (<option key={x.key} value={x.key}>{x.label}</option>))}
                  </select>
                </div>
              ))}
              <div className="flex items-center gap-md">
                <AddRow statusKey={s.key} adding={adding} draft={draft} setDraft={setDraft} setAdding={setAdding} onAdd={onAdd} variant="row" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardView({ tasks, members, adding, draft, setDraft, setAdding, onAdd, onMove, onOpen }: ViewProps) {
  return (
    <div className="flex gap-lg overflow-x-auto pb-lg">
      {STATUSES.map((s) => {
        const items = tasks.filter((t) => t.status === s.key);
        return (
          <div key={s.key} className="flex flex-col gap-md w-80 flex-shrink-0">
            <div className="flex items-center gap-sm px-xs">
              <span className={`w-2 h-2 rounded-full ${s.dot}`} />
              <h3 className="text-headline-md">{s.label}</h3>
              <span className="bg-surface-container-high text-on-surface-variant px-2 py-0.5 rounded-full text-label-sm">{items.length}</span>
            </div>
            <div className="flex flex-col gap-md">
              {items.map((t) => (
                <button key={t.id} onClick={() => onOpen(t.id)} className="card p-md shadow-sm hover:shadow-popover transition-shadow text-left">
                  <div className="flex gap-sm mb-sm items-center">
                    <span className={`chip ${PRIORITIES[t.priority]?.cls ?? ""}`}>{PRIORITIES[t.priority]?.label ?? t.priority}</span>
                    <Labels t={t} />
                  </div>
                  <h4 className="text-body-md font-semibold text-on-surface mb-md">{t.title}</h4>
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-sm">
                      <CardMeta t={t} />
                      {t.assigneeId && members[t.assigneeId] && (
                        <Avatar name={members[t.assigneeId]} size={24} />
                      )}
                    </div>
                    <span onClick={(e) => e.stopPropagation()}>
                      <select
                        value={t.status}
                        onChange={(e) => onMove(t, e.target.value)}
                        className="text-body-sm bg-transparent border border-outline-variant rounded-md px-1.5 py-0.5 text-on-surface-variant"
                      >
                        {STATUSES.map((x) => (<option key={x.key} value={x.key}>{x.label}</option>))}
                      </select>
                    </span>
                  </div>
                </button>
              ))}
              <AddRow statusKey={s.key} adding={adding} draft={draft} setDraft={setDraft} setAdding={setAdding} onAdd={onAdd} variant="card" />
            </div>
          </div>
        );
      })}
    </div>
  );
}
