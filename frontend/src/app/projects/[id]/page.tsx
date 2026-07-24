"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, Member, Project, Task } from "@/lib/api";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import Avatar from "@/components/Avatar";
import TaskDrawer from "@/components/TaskDrawer";
import { STATUSES, PRIORITIES, labelColor } from "@/lib/status";

type View = "list" | "board";
type Members = Record<string, { name: string; avatarUrl: string }>;

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

  const reload = useCallback(() => {
    api.listTasks(id).then(setTasks).catch(() => {});
  }, [id]);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    api.projectMembers(id).then((ms: Member[]) => {
      const map: Members = {};
      ms.forEach((m) => (map[m.userId] = { name: m.displayName || m.email, avatarUrl: m.avatarUrl || "" }));
      setMembers(map);
    }).catch(() => {});
    reload();
  }, [id, reload]);

  const filtered = tasks.filter((t) =>
    (query ? t.title.toLowerCase().includes(query.toLowerCase()) : true)
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

  const shared = { tasks: filtered, members, adding, draft, setDraft, setAdding, onAdd: addTask, onMove: move, onOpen: setOpenTask };

  return (
    <AppShell title={
      <div className="flex items-center gap-2 text-[14px]">
        <Icon name="home" size={18} className="text-gray-400" />
        <span className="text-gray-500 font-medium">Dashboard</span>
      </div>
    } actions={
      <div className="flex items-center gap-6 text-[13px] font-medium text-gray-500 mr-4">
        <a href="#" className="flex items-center gap-1.5 hover:text-gray-900"><Icon name="help_outline" size={18} /> Help Chat</a>
        <a href="#" className="flex items-center gap-1.5 hover:text-gray-900"><Icon name="description" size={18} /> Docs</a>
        <a href="#" className="flex items-center gap-1.5 hover:text-gray-900"><Icon name="print" size={18} /> Print</a>
      </div>
    }>
      <div className="p-8 max-w-[1400px] mx-auto">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between mb-8 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500 text-white flex items-center justify-center shadow-sm">
              <Icon name="folder_open" size={20} />
            </div>
            <h1 className="text-[22px] font-bold text-gray-900">{project?.name || "Name Project"}</h1>
            <button className="text-gray-400 hover:text-gray-600 transition-colors ml-1">
              <Icon name="edit" size={18} />
            </button>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-1.5 bg-white border border-gray-200 rounded-full text-[13px] font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
              <Icon name="filter_list" size={18} className="text-gray-400" /> Filter
            </button>
            <button className="flex items-center gap-2 px-4 py-1.5 bg-white border border-gray-200 rounded-full text-[13px] font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
              <Icon name="sort" size={18} className="text-gray-400" /> Sort
            </button>
            <button className="flex items-center gap-2 px-4 py-1.5 bg-white border border-gray-200 rounded-full text-[13px] font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
              <Icon name="check" size={18} className="text-gray-400" /> Closed
            </button>
            <button className="flex items-center gap-2 px-4 py-1.5 bg-white border border-gray-200 rounded-full text-[13px] font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
              <Icon name="group" size={18} className="text-gray-400" /> Assignee
            </button>
            
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
            
            <button className="flex items-center gap-1.5 px-5 py-1.5 bg-gray-900 text-white rounded-full text-[13px] font-semibold hover:bg-gray-800 shadow-sm ml-1" onClick={() => { setView("list"); setDraft(""); setAdding(STATUSES[0].key); }}>
              <Icon name="add" size={18} /> Add Task
            </button>
          </div>
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

function ListView({ tasks, members, adding, draft, setDraft, setAdding, onAdd, onMove, onOpen }: ViewProps) {
  return (
    <div className="flex flex-col gap-10">
      {STATUSES.map((s) => {
        const items = tasks.filter((t) => t.status === s.key);
        return (
          <div key={s.key} className="flex flex-col gap-3">
            {/* Group Header */}
            <div className="flex items-center justify-between">
              <span className={`px-3 py-1 rounded-full text-[12px] font-bold ${s.chipBg} ${s.chipText}`}>
                {s.label}
              </span>
              <div className="flex items-center gap-1 text-gray-400">
                <button className="p-1 hover:bg-gray-100 rounded-md"><Icon name="more_horiz" size={20} /></button>
                <button className="p-1 hover:bg-gray-100 rounded-md" onClick={() => setAdding(s.key)}><Icon name="add" size={20} /></button>
                <button className="p-1 hover:bg-gray-100 rounded-md"><Icon name="expand_less" size={20} /></button>
              </div>
            </div>

            {/* Tasks List */}
            <div className="flex flex-col gap-3">
              {items.map((t) => (
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
                  <div className="flex items-center gap-2 text-gray-500 text-[12px] font-medium ml-6 shrink-0 w-32 justify-end">
                    {(t.startDate || t.dueDate) && (
                      <div className="flex items-center gap-1.5 border border-gray-100 rounded-md px-2 py-1">
                        <Icon name="calendar_today" size={14} />
                        <span>
                          {t.startDate ? new Date(t.startDate).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' }) : ""} 
                          {t.startDate && t.dueDate ? " - " : ""}
                          {t.dueDate ? new Date(t.dueDate).toLocaleDateString('vi-VN', { month: 'short', day: 'numeric' }) : ""}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              
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

function BoardView({ tasks, members, adding, draft, setDraft, setAdding, onAdd, onMove, onOpen }: ViewProps) {
  // Keeping simple board view for fallback, styling it slightly to match new aesthetic
  return (
    <div className="flex gap-lg overflow-x-auto pb-lg">
      {STATUSES.map((s) => {
        const items = tasks.filter((t) => t.status === s.key);
        return (
          <div key={s.key} className="flex flex-col gap-3 w-80 flex-shrink-0">
            <div className="flex items-center justify-between">
              <span className={`px-3 py-1 rounded-full text-[12px] font-bold ${s.chipBg} ${s.chipText}`}>
                {s.label}
              </span>
              <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-[11px] font-bold">{items.length}</span>
            </div>
            <div className="flex flex-col gap-3">
              {items.map((t) => (
                <button key={t.id} onClick={() => onOpen(t.id)} className="bg-white border border-gray-200 p-4 rounded-xl shadow-sm hover:border-gray-300 transition-colors text-left flex flex-col gap-3">
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
                        <span className="text-[12px] text-gray-500 font-medium flex items-center gap-1">
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
