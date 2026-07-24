"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, CalendarItem, Project, Workspace } from "@/lib/api";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";
import TaskDrawer from "@/components/TaskDrawer";
import {
  START_HOUR, ROW_H, hours, fmtHour, fmtTime, startOfWeek, addDays, sameDay, ymd,
  eventColor, eventBox,
} from "@/lib/calendar";

type View = "day" | "week" | "month" | "year";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CalendarPage() {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [tasks, setTasks] = useState<CalendarItem[]>([]);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [newAt, setNewAt] = useState<Date | null>(null);

  const range = useMemo(() => {
    if (view === "month" || view === "year") {
      const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
      const gridStart = startOfWeek(first);
      return { from: gridStart, to: addDays(gridStart, 42), days: 42 };
    }
    if (view === "day") {
      const d = new Date(cursor); d.setHours(0, 0, 0, 0);
      return { from: d, to: addDays(d, 1), days: 1 };
    }
    const ws = startOfWeek(cursor);
    return { from: ws, to: addDays(ws, 7), days: 7 };
  }, [view, cursor]);

  const load = useCallback(() => {
    api.myCalendar(ymd(range.from), ymd(range.to)).then(setTasks).catch(() => setTasks([]));
  }, [range.from, range.to]);
  useEffect(() => { load(); }, [load]);

  const days = useMemo(
    () => Array.from({ length: range.days }, (_, i) => addDays(range.from, i)),
    [range.from, range.days],
  );
  const today = new Date();

  function shift(dir: number) {
    if (view === "month") setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + dir, 1));
    else setCursor(addDays(cursor, dir * (view === "week" ? 7 : 1)));
  }

  const title = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;

  const actions = (
    <div className="flex items-center gap-6">
      <div className="flex bg-white border border-gray-200 rounded-full p-1 shadow-sm">
        {(["day", "week", "month", "year"] as View[]).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-5 py-1.5 rounded-full text-[13px] font-semibold capitalize transition-colors ${view === v ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:text-gray-700"}`}>
            {v}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <button className="px-5 py-2 bg-white border border-gray-200 rounded-full text-[13px] font-semibold text-gray-700 shadow-sm hover:bg-gray-50" onClick={() => setCursor(new Date())}>
          Today
        </button>
        <button className="flex items-center gap-2 px-5 py-2 bg-gray-900 text-white rounded-full text-[13px] font-semibold hover:bg-gray-800 shadow-sm" onClick={() => { const d = new Date(); d.setMinutes(0, 0, 0); setNewAt(d); }}>
          Add Event
        </button>
      </div>
    </div>
  );

  return (
    <AppShell title={null} actions={null}>
      <div className="p-8 max-w-[1400px] mx-auto bg-white">
        {/* Custom Header for Calendar */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <h2 className="text-[22px] font-bold text-gray-900">{title}</h2>
          </div>
          {actions}
        </div>

        {view === "month" || view === "year" ? (
          <MonthGrid days={days} cursor={cursor} tasks={tasks} onOpen={setOpenTask} today={today} />
        ) : (
          <TimeGrid days={days} tasks={tasks} onOpen={setOpenTask} onSlot={(d) => setNewAt(d)} today={today} />
        )}
      </div>

      {openTask && <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={load} />}
      {newAt && <NewEventModal at={newAt} onClose={() => setNewAt(null)} onCreated={() => { setNewAt(null); load(); }} />}
    </AppShell>
  );
}

function TimeGrid({ days, tasks, onOpen, onSlot, today }: {
  days: Date[]; tasks: CalendarItem[];
  onOpen: (id: string) => void; onSlot: (d: Date) => void; today: Date;
}) {
  const timed = (d: Date) => tasks.filter((t) => t.startAt && sameDay(new Date(t.startAt), d));

  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm h-[calc(100vh-160px)] overflow-y-auto relative">
      {/* Day headers */}
      <div className="sticky top-0 z-30 flex border-b border-gray-200 bg-white">
        <div className="w-16 flex-shrink-0 border-r border-gray-200" />
        {days.map((d, i) => {
          const isToday = sameDay(d, today);
          return (
            <div key={i} className="flex-1 text-center py-4 border-r border-gray-200 last:border-r-0">
              <div className="text-[14px] font-semibold flex items-center justify-center gap-1.5">
                <span className={isToday ? "text-blue-600" : "text-gray-500"}>{WEEKDAYS[(d.getDay() + 6) % 7]}</span>
                <span className={isToday ? "text-blue-600" : "text-gray-900"}>{d.getDate()}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Hour rows */}
      <div className="flex">
        <div className="w-16 flex-shrink-0 bg-white border-r border-gray-200 z-10">
          {hours().map((h) => (
            <div key={h} className="text-[12px] font-medium text-gray-500 border-b border-gray-200 flex items-center justify-center" style={{ height: 80 }}>
              <span>{fmtHour(h)}</span>
            </div>
          ))}
        </div>
        
        {/* Grid Background Lines removed in favor of borders on slots */}

        {days.map((d, di) => (
          <div key={di} className="flex-1 relative border-r border-gray-200 last:border-r-0">
            {hours().map((h) => (
              <div key={h} onClick={() => { const dd = new Date(d); dd.setHours(h, 0, 0, 0); onSlot(dd); }}
                className="cursor-pointer hover:bg-gray-50/50 transition-colors border-b border-gray-200" style={{ height: 80 }} />
            ))}
            
            {/* Now line */}
            {sameDay(d, today) && <NowLine />}
            
            {/* Events */}
            {timed(d).map((t) => {
              const startDt = new Date(t.startAt!);
              const endDt = t.endAt ? new Date(t.endAt) : new Date(startDt.getTime() + 3600000 * 2); // default 2 hrs for display
              
              const startMin = (startDt.getHours() - START_HOUR) * 60 + startDt.getMinutes();
              const top = (startMin / 60) * 80;
              const durationMins = (endDt.getTime() - startDt.getTime()) / 60000;
              const height = (durationMins / 60) * 80;
              
              // Map colors loosely based on status or random
              const bgColors = ["bg-[#e8f0fe] text-blue-600", "bg-[#e6f4ea] text-green-700", "bg-[#fff3e0] text-orange-600", "bg-[#fce8e6] text-red-600", "bg-[#f3e8fd] text-purple-600"];
              const randomColor = bgColors[(t.id.charCodeAt(0) + t.id.charCodeAt(1)) % bgColors.length];

              return (
                <button key={t.id} onClick={(ev) => { ev.stopPropagation(); onOpen(t.id); }}
                  className={`absolute left-1.5 right-1.5 rounded-xl p-3 text-left overflow-hidden shadow-sm hover:shadow-md transition-shadow flex flex-col gap-2 border border-white/50 ${randomColor}`}
                  style={{ top: Math.max(0, top), height: Math.max(40, height) }}>
                  <div className="text-[13px] font-bold leading-tight">{t.title}</div>
                  
                  {height > 60 && (
                    <div className="flex items-center gap-1.5 mt-auto">
                      <span className="px-2 py-0.5 rounded-full bg-white/60 text-[10px] font-bold">{fmtTime(startDt)}</span>
                      <span className="px-2 py-0.5 rounded-full bg-white/60 text-[10px] font-bold">{fmtTime(endDt)}</span>
                    </div>
                  )}
                  
                  {height >= 80 && (t.assigneeId || (t.participantIds && t.participantIds.length > 0)) && (
                    <div className="flex items-center -space-x-1.5 mt-1">
                      {t.assigneeId && (
                        <img 
                          src={t.assigneeAvatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(t.assigneeName || 'User')}&background=random`} 
                          className="w-5 h-5 rounded-full border border-white relative z-10" 
                          alt={t.assigneeName || 'Avatar'} 
                          title={t.assigneeName}
                        />
                      )}
                      {t.participantIds && t.participantIds.map((pid, idx) => (
                        <img 
                          key={pid}
                          src={`https://ui-avatars.com/api/?name=P&background=random`} 
                          className="w-5 h-5 rounded-full border border-white" 
                          style={{ zIndex: 9 - idx }}
                          alt="Participant" 
                          title="Participant"
                        />
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function NowLine() {
  const now = new Date();
  const min = (now.getHours() - 11) * 60 + now.getMinutes(); // assume 11 start
  if (now.getHours() < 11) return null;
  const top = (min / 60) * 80;
  return (
    <div className="absolute left-0 right-0 z-20 pointer-events-none" style={{ top }}>
      <div className="h-[2px] bg-red-500 relative"><span className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-red-500" /></div>
    </div>
  );
}

function MonthGrid({ days, cursor, tasks, onOpen, today }: {
  days: Date[]; cursor: Date; tasks: CalendarItem[]; onOpen: (id: string) => void; today: Date;
}) {
  return (
    <div className="border border-gray-200 rounded-2xl overflow-hidden bg-white shadow-sm">
      <div className="grid grid-cols-7 border-b border-gray-200">
        {WEEKDAYS.map((d) => (<div key={d} className="py-4 text-[14px] font-semibold text-gray-500 text-center">{d}</div>))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = sameDay(d, today);
          return (
            <div key={i} className={`min-h-[120px] border-b border-r border-gray-200 p-2 ${inMonth ? "bg-white" : "bg-gray-50/50"}`}>
              <div className={`text-[13px] font-semibold mb-2 w-7 h-7 mx-auto flex items-center justify-center rounded-full ${isToday ? "bg-blue-600 text-white" : inMonth ? "text-gray-900" : "text-gray-400"}`}>{d.getDate()}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function NewEventModal({ at, onClose, onCreated }: { at: Date; onClose: () => void; onCreated: () => void }) {
  const [projects, setProjects] = useState<(Project & { wsName: string })[]>([]);
  const [projectId, setProjectId] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [showPartMenu, setShowPartMenu] = useState(false);
  const [titleV, setTitleV] = useState("");
  const [date, setDate] = useState(ymd(at));
  const [start, setStart] = useState(fmtTime(at));
  const [end, setEnd] = useState(() => {
    const t = new Date(at);
    t.setHours(t.getHours() + 1);
    return fmtTime(t);
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const wss: Workspace[] = await api.listWorkspaces().catch(() => []);
      const all: (Project & { wsName: string })[] = [];
      for (const ws of wss) {
        const ps = await api.listProjects(ws.id).catch(() => []);
        ps.forEach((p) => all.push({ ...p, wsName: ws.name }));
      }
      setProjects(all);
      if (all.length > 0) setProjectId(all[0].id);
    })();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    api.projectMembers(projectId).then(res => {
      setMembers(res);
    }).catch(() => setMembers([]));
  }, [projectId]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !titleV.trim()) return;
    setBusy(true);
    try {
      const t = await api.createTask(projectId, { 
        title: titleV.trim(), 
        assigneeId: assigneeId || undefined,
        participantIds: participantIds
      });
      await api.updateTask(t.id, {
        startAt: new Date(`${date}T${start}`).toISOString(),
        endAt: new Date(`${date}T${end}`).toISOString(),
      });
      onCreated();
    } catch (err) {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/10 backdrop-blur-[2px]" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={create} className="bg-white rounded-[24px] shadow-2xl p-6 w-full max-w-sm border border-gray-100 relative">
        <button type="button" onClick={onClose} className="absolute right-6 top-6 text-gray-400 hover:text-gray-600 transition-colors">
          <Icon name="close" size={20} />
        </button>
        
        <h3 className="text-[18px] font-bold text-gray-900 mb-6">New Event</h3>
        
        <div className="flex flex-col gap-4">
          <input className="w-full bg-white border border-gray-200 rounded-full px-4 py-3 text-[14px] font-medium placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all shadow-sm" placeholder="Event Title" value={titleV} onChange={(e) => setTitleV(e.target.value)} autoFocus />
          
          <div className="relative">
            <div className="absolute left-4 top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-green-500" />
            <select className="w-full bg-white border border-gray-200 rounded-full pl-10 pr-4 py-3 text-[14px] font-medium text-gray-700 appearance-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all shadow-sm" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
              {projects.length === 0 && <option value="">Emerald</option>}
            </select>
            <Icon name="unfold_more" size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          <div className="relative">
            <Icon name="location_on" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full bg-white border border-gray-200 rounded-full pl-10 pr-4 py-3 text-[14px] font-medium placeholder-gray-500 outline-none shadow-sm" placeholder="Add Place" />
          </div>

          <div className="relative">
            <Icon name="calendar_today" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input type="date" className="w-full bg-white border border-gray-200 rounded-full pl-10 pr-4 py-3 text-[14px] font-medium text-gray-700 outline-none shadow-sm" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Icon name="schedule" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="time" className="w-full bg-white border border-gray-200 rounded-full pl-10 pr-2 py-3 text-[14px] font-medium text-gray-700 outline-none shadow-sm" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="relative flex-1">
              <Icon name="schedule" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="time" className="w-full bg-white border border-gray-200 rounded-full pl-10 pr-2 py-3 text-[14px] font-medium text-gray-700 outline-none shadow-sm" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3">
            <div className="relative flex-1">
              <Icon name="person" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <select className="w-full bg-white border border-gray-200 rounded-full pl-10 pr-4 py-3 text-[14px] font-medium text-gray-700 appearance-none outline-none shadow-sm" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
                <option value="">Người phụ trách (Chưa gán)</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>
                ))}
              </select>
              <Icon name="unfold_more" size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
            
            <div className="relative flex-1">
              <Icon name="groups" size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <div 
                className="w-full bg-white border border-gray-200 rounded-full pl-10 pr-10 py-3 text-[14px] font-medium text-gray-700 outline-none shadow-sm cursor-pointer truncate select-none"
                onClick={() => setShowPartMenu(!showPartMenu)}
              >
                {participantIds.length > 0 
                  ? members.filter(m => participantIds.includes(m.userId)).map(m => m.displayName || m.email).join(", ") 
                  : "Người cùng tham gia"}
              </div>
              <Icon name="unfold_more" size={20} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              
              {showPartMenu && (
                <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-100 rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto py-1">
                  {members.map(m => (
                    <label key={m.userId} className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4"
                        checked={participantIds.includes(m.userId)}
                        onChange={(e) => {
                          if (e.target.checked) setParticipantIds([...participantIds, m.userId]);
                          else setParticipantIds(participantIds.filter(id => id !== m.userId));
                        }}
                      />
                      <span className="text-[14px] text-gray-700 truncate">{m.displayName || m.email}</span>
                    </label>
                  ))}
                  {members.length === 0 && <div className="px-4 py-2 text-[13px] text-gray-500">Không có thành viên</div>}
                </div>
              )}
            </div>
          </div>

          <textarea className="w-full bg-white border border-gray-200 rounded-2xl px-4 py-3 text-[14px] font-medium placeholder-gray-500 outline-none shadow-sm min-h-[100px] resize-none" placeholder="Add Notes" />

          <button className="w-full py-4 bg-gray-900 text-white rounded-full text-[15px] font-bold hover:bg-black transition-colors shadow-md mt-2" disabled={busy || !projectId || !titleV.trim()}>
            Add Event
          </button>
        </div>
      </form>
    </div>
  );
}
