"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { api, Member, Project, SavedView, Task, WorkflowStatus } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import TaskDrawer from "@/components/task/TaskDrawer";
import ProjectTabs from "@/components/layout/ProjectTabs";
import { StatusDef, toStatusDefs } from "@/lib/status";
import { useProjectEvents } from "@/lib/useProjectEvents";
import TaskFilters, {
  applyFilters,
  groupTasks,
  EMPTY_FILTERS,
  FilterState,
  GroupKey,
  SortKey,
} from "@/components/task/TaskFilters";
import VirtualList from "@/components/ui/VirtualList";

type View = "list" | "board";
type Members = Record<string, { name: string; avatarUrl: string }>;

export default function ProjectBoardPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Members>({});
  const [view, setView] = useState<View>("list");
  const [adding, setAdding] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [sort, setSort] = useState<SortKey>("position");
  const [group, setGroup] = useState<GroupKey>("status");
  const [memberList, setMemberList] = useState<Member[]>([]);
  const [labels, setLabels] = useState<{ id: string; name: string }[]>([]);
  const [views, setViews] = useState<SavedView[]>([]);

  const reload = useCallback(() => {
    api.listTasks(id).then(setTasks).catch(() => {});
    api.listStatuses(id).then(setStatuses).catch(() => setStatuses([]));
  }, [id]);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    api.projectMembers(id).then((ms: Member[]) => {
      const map: Members = {};
      ms.forEach((m) => (map[m.userId] = { name: m.displayName || m.email, avatarUrl: m.avatarUrl || "" }));
      setMembers(map);
      setMemberList(ms);
    }).catch(() => {});
    api.listLabels(id).then(setLabels).catch(() => setLabels([]));
    api.listViews(id).then(setViews).catch(() => setViews([]));
    reload();
  }, [id, reload]);

  // Live updates: refresh the board when someone else changes a task.
  useProjectEvents(id, () => reload());

  // Deep link: notifications point at /projects/{id}?task={taskId}, so opening
  // one lands here and must open the drawer straight away.
  const deepTask = searchParams.get("task");
  useEffect(() => {
    if (deepTask) setOpenTask(deepTask);
  }, [deepTask]);

  const filtered = applyFilters(tasks, filters, sort, query);

  async function addTask(status: string) {
    if (!draft.trim()) return;
    await api.createTask(id, { title: draft.trim(), status });
    setDraft("");
    setAdding(null);
    reload();
  }
  async function move(task: Task, status: string) {
    try {
      await api.updateTaskStatus(task.id, status);
    } catch (err: any) {
      // Surface WIP-limit rejections instead of silently doing nothing.
      alert(err?.message || "Không thể chuyển trạng thái");
    }
    reload();
  }

  async function saveCurrentView() {
    const name = window.prompt("Đặt tên cho view này:");
    if (!name?.trim()) return;
    try {
      await api.createView(id, name.trim(), { view, sort, filters });
      api.listViews(id).then(setViews).catch(() => {});
    } catch (e) {
      alert((e as Error).message);
    }
  }

  /** Restores a saved view's filter/sort/mode. */
  function applyView(v: SavedView) {
    const cfg = v.config as {
      view?: View;
      sort?: SortKey;
      filters?: FilterState;
    };
    if (cfg.view) setView(cfg.view);
    if (cfg.sort) setSort(cfg.sort);
    setFilters({ ...EMPTY_FILTERS, ...(cfg.filters ?? {}) });
  }

  const statusDefs = toStatusDefs(statuses);
  const wipByKey: Record<string, { count: number; limit?: number }> = {};
  statuses.forEach((s) => (wipByKey[s.key] = { count: s.taskCount, limit: s.wipLimit }));

  const shared = {
    tasks: filtered,
    members,
    adding,
    draft,
    setDraft,
    setAdding,
    onAdd: addTask,
    onMove: move,
    onOpen: setOpenTask,
    statusDefs,
    wipByKey,
    group,
    // Resolves a group key (user id, priority…) to a human label.
    labelForGroup: (key: string) => {
      if (key === "unassigned") return "Chưa gán";
      if (key === "none") return "Chưa đặt";
      return members[key]?.name ?? key;
    },
  };

  return (
    <AppShell title={
      // Header matches the other project pages so the project you're in is
      // always named the same way, instead of saying "Dashboard".
      <div className="flex items-center gap-sm">
        {project && <span className="chip bg-primary-container/10 text-primary">{project.key}</span>}
        <span>{project?.name || "Dự án"}</span>
      </div>
    }>
      <div className="p-8 max-w-[1400px] mx-auto">
        {/* The board is the project's landing page, but it was the only project
            page without the tab bar — so Sprints/Timeline/Reports were
            unreachable once you clicked into a project. */}
        <ProjectTabs projectId={id} />

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500 text-white flex items-center justify-center shadow-sm">
              <Icon name="folder_open" size={20} />
            </div>
            <h1 className="text-[22px] font-bold text-gray-900">{project?.name || "Dự án"}</h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Saved views */}
            {views.length > 0 && (
              <select
                className="bg-white border border-gray-200 rounded-full px-3 py-1.5 text-[13px] font-semibold text-gray-700 shadow-sm"
                defaultValue=""
                onChange={(e) => {
                  const v = views.find((x) => x.id === e.target.value);
                  if (v) applyView(v);
                }}
                title="Mở view đã lưu"
              >
                <option value="">Views đã lưu…</option>
                {views.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.shared ? "👥 " : ""}{v.name}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={saveCurrentView}
              title="Lưu bộ lọc + kiểu hiển thị hiện tại thành view"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-full text-[13px] font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
            >
              <Icon name="bookmark_add" size={16} /> Lưu view
            </button>

            {/* List ↔ Board toggle */}
            <div className="flex items-center bg-white border border-gray-200 rounded-full p-0.5 shadow-sm">
              {(["list", "board"] as const).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  title={v === "list" ? "Dạng danh sách" : "Dạng bảng Kanban"}
                  className={`flex items-center gap-1 px-3 py-1 rounded-full text-[13px] font-semibold transition-colors ${
                    view === v ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <Icon name={v === "list" ? "view_list" : "view_kanban"} size={16} />
                  {v === "list" ? "List" : "Board"}
                </button>
              ))}
            </div>

            <TaskFilters
              filters={filters}
              setFilters={setFilters}
              sort={sort}
              setSort={setSort}
              group={group}
              setGroup={(g) => setGroup(g as GroupKey)}
              members={memberList}
              labels={labels}
              resultCount={filtered.length}
            />

            <div className="relative ml-1">
              <input
                className="bg-white border border-gray-200 rounded-full pl-4 pr-12 py-1.5 w-[200px] text-[13px] outline-none placeholder-gray-400 focus:border-gray-300 shadow-sm"
                placeholder="Search Task"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 bg-gray-100 text-gray-500 rounded px-1.5 py-[2px] text-[10px] font-medium border border-gray-200">
                ⌘K
              </span>
            </div>
            
            <button className="flex items-center gap-1.5 px-5 py-1.5 bg-gray-900 text-white rounded-full text-[13px] font-semibold hover:bg-gray-800 shadow-sm ml-1" onClick={() => { setView("list"); setDraft(""); setAdding(statusDefs[0]?.key ?? "todo"); }}>
              <Icon name="add" size={18} /> Add Task
            </button>
          </div>
        </div>

        {view === "list" ? <ListView {...shared} /> : <BoardView {...shared} />}
      </div>

      {openTask && (
        <TaskDrawer
          taskId={openTask}
          highlightCommentId={searchParams.get("comment") ?? undefined}
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
  statusDefs: StatusDef[];
  wipByKey: Record<string, { count: number; limit?: number }>;
  group: GroupKey;
  labelForGroup: (key: string) => string;
}

/** Shows "count/limit" and turns red once a column is at or over its WIP limit. */
function WipBadge({ wip }: { wip?: { count: number; limit?: number } }) {
  if (!wip) return null;
  if (!wip.limit) {
    return (
      <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-[11px] font-bold">
        {wip.count}
      </span>
    );
  }
  const over = wip.count >= wip.limit;
  return (
    <span
      title={`Giới hạn WIP: ${wip.limit}`}
      className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
        over ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-500"
      }`}
    >
      {wip.count}/{wip.limit}
    </span>
  );
}

function ListView(props: ViewProps) {
  const { tasks, group, labelForGroup } = props;

  // When grouping by something other than status, render one swimlane per
  // group and reuse the status-column layout inside it.
  if (group !== "status" && group !== "none") {
    const lanes = groupTasks(tasks, group, labelForGroup);
    return (
      <div className="flex flex-col gap-10">
        {lanes.map((lane) => (
          <section key={lane.key}>
            <div className="flex items-center gap-2 mb-4">
              <h3 className="text-[15px] font-bold text-gray-900">{lane.label}</h3>
              <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-[11px] font-bold">
                {lane.tasks.length}
              </span>
              <div className="flex-grow h-px bg-gray-100" />
            </div>
            <StatusGroups {...props} tasks={lane.tasks} />
          </section>
        ))}
        {lanes.length === 0 && (
          <p className="text-center text-gray-500 py-10">Không có công việc nào khớp bộ lọc.</p>
        )}
      </div>
    );
  }

  return <StatusGroups {...props} />;
}

/** Renders tasks grouped by their status column (the default layout). */
function StatusGroups({ tasks, members, adding, draft, setDraft, setAdding, onAdd, onMove, onOpen, statusDefs, wipByKey }: ViewProps) {
  return (
    <div className="flex flex-col gap-10">
      {statusDefs.map((s) => {
        const items = tasks.filter((t) => t.status === s.key);
        return (
          <div key={s.key} className="flex flex-col gap-3">
            {/* Group Header */}
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-[12px] font-bold ${s.chipBg} ${s.chipText}`} style={s.style}>
                  {s.label}
                </span>
                <WipBadge wip={wipByKey[s.key]} />
              </span>
              <div className="flex items-center gap-1 text-gray-400">
                <button className="p-1 hover:bg-gray-100 rounded-md"><Icon name="more_horiz" size={20} /></button>
                <button className="p-1 hover:bg-gray-100 rounded-md" onClick={() => setAdding(s.key)}><Icon name="add" size={20} /></button>
                <button className="p-1 hover:bg-gray-100 rounded-md"><Icon name="expand_less" size={20} /></button>
              </div>
            </div>

            {/* Tasks List — virtualised past ~60 rows so large backlogs stay smooth */}
            <VirtualList
              items={items}
              rowHeight={58}
              gap={12}
              height={620}
              className="flex flex-col gap-3"
              renderRow={(t) => (
                <div key={t.id} className="flex items-center bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)] hover:border-gray-300 transition-colors cursor-pointer group" onClick={() => onOpen(t.id)}>
                  <Icon name="drag_indicator" size={20} className="text-gray-300 mr-2 cursor-grab" />
                  
                  <div className="flex items-center mr-4" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={t.status === "done"}
                      onChange={() => onMove(t, t.status === "done" ? "todo" : "done")}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </div>
                  
                  <span className="text-[14px] font-semibold text-gray-900 flex-grow truncate">{t.title}</span>
                  
                  {/* Priority */}
                  <div className="flex items-center shrink-0 w-24">
                    {t.priority && (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border
                        ${t.priority === 'urgent' ? 'bg-red-50 text-red-600 border-red-200' : 
                          t.priority === 'high' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                          t.priority === 'medium' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                          'bg-gray-50 text-gray-500 border-gray-200'}
                      `}>
                        {t.priority}
                      </span>
                    )}
                  </div>
                  
                  {/* Tags */}
                  <div className="flex items-center gap-1.5 mx-4 shrink-0">
                    {t.labels && t.labels.length > 0 ? (
                      t.labels.map((l) => (
                        <span key={l.id} className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-gray-100 text-gray-700">
                          {l.name}
                        </span>
                      ))
                    ) : (
                      <span className="w-16"></span>
                    )}
                  </div>
                  
                  {/* Assignee & Reporter Avatars */}
                  <div className="flex items-center mr-6 shrink-0 gap-1 min-w-[72px]">
                    {/* Reporter */}
                    {t.reporterId && members[t.reporterId] ? (
                      <img 
                        src={members[t.reporterId].avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(members[t.reporterId].name)}&background=random`} 
                        className="w-6 h-6 rounded-full border-2 border-white bg-gray-100 relative z-10" 
                        alt={members[t.reporterId].name} 
                        title={`Nhận thông tin: ${members[t.reporterId].name}`}
                      />
                    ) : null}
                    
                    {/* Assignee */}
                    {t.assigneeId && members[t.assigneeId] ? (
                      <img 
                        src={members[t.assigneeId].avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(members[t.assigneeId].name)}&background=random`} 
                        className={`w-6 h-6 rounded-full border-2 border-white bg-gray-100 ${t.reporterId ? '-ml-2' : ''} relative z-20`}
                        alt={members[t.assigneeId].name} 
                        title={`Phụ trách: ${members[t.assigneeId].name}`}
                      />
                    ) : (
                      <div className={`w-6 h-6 rounded-full border-2 border-white bg-gray-100 border-dashed flex items-center justify-center text-gray-400 ${t.reporterId ? '-ml-2' : ''} relative z-20`} title="Chưa phân công">
                        <Icon name="person" size={14} />
                      </div>
                    )}
                  </div>
                  
                  {/* Meta stats */}
                  <div className="flex items-center gap-4 text-gray-400 shrink-0 w-32 justify-end">
                    {t.checklistTotal ? (
                      <span className="flex items-center gap-1 text-[13px] font-medium" title="Checklist">
                        <Icon name="check_circle" size={16} /> 
                        {t.checklistDone || 0}/{t.checklistTotal}
                      </span>
                    ) : null}
                    
                    {t.commentCount ? (
                      <span className="flex items-center gap-1 text-[13px] font-medium" title="Bình luận">
                        <Icon name="chat_bubble_outline" size={16} /> 
                        {t.commentCount}
                      </span>
                    ) : null}
                    
                    {t.description ? <Icon name="description" size={16} title="Có mô tả" /> : null}
                  </div>
                  
                  {/* Dates */}
                  <div className="flex items-center gap-2 text-gray-500 text-[12px] font-medium ml-6 shrink-0 w-auto justify-end">
                    {(t.startDate || t.dueDate) && (
                      <div className="flex items-center gap-1.5 border border-gray-100 rounded-md px-2 py-1 whitespace-nowrap shrink-0">
                        <Icon name="calendar_today" size={14} className="shrink-0 text-gray-400" />
                        <span className="whitespace-nowrap">
                          {t.startDate ? new Date(t.startDate).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' }) : ""} 
                          {t.startDate && t.dueDate ? " - " : ""}
                          {t.dueDate ? new Date(t.dueDate).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' }) : ""}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            />

            <div className="flex flex-col gap-3">
              {/* Add row */}
              {adding === s.key ? (
                <div className="flex items-center bg-white border border-blue-400 rounded-xl px-4 py-3 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.05)]">
                  <input
                    autoFocus
                    className="flex-grow bg-transparent outline-none text-[14px] font-semibold text-gray-900"
                    placeholder="Tên công việc, Enter để lưu…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onAdd(s.key);
                      if (e.key === "Escape") setAdding(null);
                    }}
                    onBlur={() => (draft.trim() ? onAdd(s.key) : setAdding(null))}
                  />
                </div>
              ) : (
                <button 
                  onClick={() => { setDraft(""); setAdding(s.key); }} 
                  className="w-full py-2.5 bg-white border border-gray-200 rounded-xl text-[13px] font-semibold text-gray-700 hover:bg-gray-50 transition-colors shadow-sm flex items-center justify-center"
                >
                  Add Task
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BoardView({ tasks, members, adding, draft, setDraft, setAdding, onAdd, onMove, onOpen, statusDefs, wipByKey }: ViewProps) {
  // Native HTML5 drag & drop — no extra dependency needed for column moves.
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<string | null>(null);

  function handleDrop(statusKey: string) {
    const task = tasks.find((t) => t.id === dragId);
    setDragId(null);
    setOverCol(null);
    if (task && task.status !== statusKey) onMove(task, statusKey);
  }

  return (
    <div className="flex gap-lg overflow-x-auto pb-lg">
      {statusDefs.map((s) => {
        const items = tasks.filter((t) => t.status === s.key);
        const wip = wipByKey[s.key];
        const full = !!wip?.limit && wip.count >= wip.limit;
        return (
          <div
            key={s.key}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(s.key);
            }}
            onDragLeave={() => setOverCol((c) => (c === s.key ? null : c))}
            onDrop={() => handleDrop(s.key)}
            className={`flex flex-col gap-3 w-80 flex-shrink-0 rounded-xl p-2 -m-2 transition-colors ${
              overCol === s.key
                ? full
                  ? "bg-red-50 ring-2 ring-red-200"
                  : "bg-blue-50 ring-2 ring-blue-200"
                : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <span className={`px-3 py-1 rounded-full text-[12px] font-bold ${s.chipBg} ${s.chipText}`} style={s.style}>
                {s.label}
              </span>
              <WipBadge wip={wip ?? { count: items.length }} />
            </div>
            <div className="flex flex-col gap-3 min-h-[60px]">
              {items.map((t) => (
                <button
                  key={t.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(t.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverCol(null);
                  }}
                  onClick={() => onOpen(t.id)}
                  className={`bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:border-gray-300 transition-all text-left flex flex-col gap-3 cursor-grab active:cursor-grabbing ${
                    dragId === t.id ? "opacity-40 scale-[0.98]" : ""
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-[14px] font-semibold text-gray-900 leading-snug">{t.title}</h4>
                    {t.priority && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border shrink-0
                        ${t.priority === 'urgent' ? 'bg-red-50 text-red-600 border-red-200' : 
                          t.priority === 'high' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                          t.priority === 'medium' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                          'bg-gray-50 text-gray-500 border-gray-200'}
                      `}>
                        {t.priority}
                      </span>
                    )}
                  </div>
                  <div className="flex justify-between items-center w-full mt-auto pt-2">
                    <div className="flex gap-2">
                      {t.dueDate ? (
                        <span className="text-[12px] text-gray-500 font-medium flex items-center gap-1 whitespace-nowrap">
                          <Icon name="calendar_today" size={14} />
                          {new Date(t.dueDate).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' })}
                        </span>
                      ) : (
                        <span className="text-[12px] text-gray-400 font-medium italic">Không có hạn</span>
                      )}
                      
                      {t.commentCount ? (
                         <span className="text-[12px] text-gray-400 font-medium flex items-center gap-0.5">
                           <Icon name="chat_bubble_outline" size={14} />
                           {t.commentCount}
                         </span>
                      ) : null}
                    </div>
                    <div className="flex items-center shrink-0 min-w-[36px] justify-end">
                      {t.reporterId && members[t.reporterId] ? (
                        <img 
                          src={members[t.reporterId].avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(members[t.reporterId].name)}&background=random`} 
                          className="w-6 h-6 rounded-full border-2 border-white bg-gray-100 relative z-10" 
                          alt={members[t.reporterId].name} 
                          title={`Nhận thông tin: ${members[t.reporterId].name}`}
                        />
                      ) : null}
                      
                      {t.assigneeId && members[t.assigneeId] ? (
                        <img 
                          src={members[t.assigneeId].avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(members[t.assigneeId].name)}&background=random`} 
                          className={`w-6 h-6 rounded-full border-2 border-white bg-gray-100 relative z-20 ${t.reporterId ? '-ml-2' : ''}`} 
                          alt={members[t.assigneeId].name} 
                          title={`Phụ trách: ${members[t.assigneeId].name}`}
                        />
                      ) : (
                        <div className={`w-6 h-6 rounded-full border-2 border-white bg-gray-100 border-dashed flex items-center justify-center text-gray-400 relative z-20 ${t.reporterId ? '-ml-2' : ''}`} title="Chưa phân công">
                          <Icon name="person" size={14} />
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
              <button onClick={() => setAdding(s.key)} className="w-full py-2 bg-gray-50 border border-gray-200 border-dashed rounded-xl text-[13px] font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors flex items-center justify-center gap-1">
                <Icon name="add" size={18} /> Add Task
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
