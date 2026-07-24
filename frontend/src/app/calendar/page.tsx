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

type View = "day" | "week" | "month";
const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const MONTHS = ["Tháng 1","Tháng 2","Tháng 3","Tháng 4","Tháng 5","Tháng 6","Tháng 7","Tháng 8","Tháng 9","Tháng 10","Tháng 11","Tháng 12"];

export default function CalendarPage() {
  const [view, setView] = useState<View>("week");
  const [cursor, setCursor] = useState(() => new Date());
  const [tasks, setTasks] = useState<CalendarItem[]>([]);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [newAt, setNewAt] = useState<Date | null>(null);

  const range = useMemo(() => {
    if (view === "month") {
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

  const title = view === "month"
    ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    : view === "day"
    ? cursor.toLocaleDateString("vi", { weekday: "long", day: "numeric", month: "long" })
    : `${range.from.toLocaleDateString()} – ${addDays(range.from, 6).toLocaleDateString()}`;

  const actions = (
    <div className="flex items-center gap-sm">
      <div className="flex bg-surface-container-low rounded-lg p-0.5">
        {(["day", "week", "month"] as View[]).map((v) => (
          <button key={v} onClick={() => setView(v)}
            className={`px-3 py-1 rounded-md text-body-sm capitalize ${view === v ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}>
            {v === "day" ? "Ngày" : v === "week" ? "Tuần" : "Tháng"}
          </button>
        ))}
      </div>
      <button className="btn-primary" onClick={() => { const d = new Date(); d.setMinutes(0, 0, 0); setNewAt(d); }}>
        <Icon name="add" size={18} /> New Event
      </button>
    </div>
  );

  return (
    <AppShell title="Calendar" actions={actions}>
      <div className="p-lg">
        <div className="flex items-center justify-between mb-md">
          <h2 className="text-headline-md">{title}</h2>
          <div className="flex items-center gap-sm">
            <button className="btn-ghost" onClick={() => shift(-1)}><Icon name="chevron_left" size={18} /></button>
            <button className="btn-ghost" onClick={() => setCursor(new Date())}>Hôm nay</button>
            <button className="btn-ghost" onClick={() => shift(1)}><Icon name="chevron_right" size={18} /></button>
          </div>
        </div>

        {view === "month" ? (
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

/* ── Week / Day time grid ─────────────────────────────────── */
function TimeGrid({ days, tasks, onOpen, onSlot, today }: {
  days: Date[]; tasks: CalendarItem[];
  onOpen: (id: string) => void; onSlot: (d: Date) => void; today: Date;
}) {
  const allDay = (d: Date) => tasks.filter((t) => !t.startAt && t.dueDate && sameDay(new Date(t.dueDate), d));
  const timed = (d: Date) => tasks.filter((t) => t.startAt && sameDay(new Date(t.startAt), d));

  return (
    <div className="card overflow-hidden">
      {/* Day headers */}
      <div className="flex border-b border-outline-variant">
        <div className="w-16 flex-shrink-0" />
        {days.map((d, i) => {
          const isToday = sameDay(d, today);
          return (
            <div key={i} className="flex-1 text-center py-2 border-l border-outline-variant/50">
              <div className="text-label-md text-on-surface-variant">{WEEKDAYS[(d.getDay() + 6) % 7]}</div>
              <div className={`text-headline-md w-8 h-8 mx-auto flex items-center justify-center rounded-full ${isToday ? "bg-primary text-on-primary" : "text-on-surface"}`}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day row */}
      <div className="flex border-b border-outline-variant bg-surface-container-low/40 min-h-8">
        <div className="w-16 flex-shrink-0 text-label-sm text-on-surface-variant/60 px-2 py-1">cả ngày</div>
        {days.map((d, i) => (
          <div key={i} className="flex-1 border-l border-outline-variant/50 p-1 flex flex-col gap-0.5">
            {allDay(d).map((t) => {
              const c = eventColor(t.status);
              return (
                <button key={t.id} onClick={() => onOpen(t.id)}
                  className="text-left text-label-md truncate px-1.5 py-0.5 rounded"
                  style={{ background: c.bg, color: c.text, borderLeft: `3px solid ${c.border}` }}>
                  {t.title}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Hour rows */}
      <div className="flex max-h-[calc(100vh-16rem)] overflow-y-auto">
        <div className="w-16 flex-shrink-0">
          {hours().map((h) => (
            <div key={h} className="text-label-sm text-on-surface-variant/60 text-right pr-2 border-t border-transparent" style={{ height: ROW_H }}>
              <span className="relative -top-2">{fmtHour(h)}</span>
            </div>
          ))}
        </div>
        {days.map((d, di) => (
          <div key={di} className="flex-1 relative border-l border-outline-variant/50">
            {hours().map((h) => (
              <div key={h} onClick={() => { const dd = new Date(d); dd.setHours(h, 0, 0, 0); onSlot(dd); }}
                className="border-t border-outline-variant/40 hover:bg-primary/5 cursor-pointer" style={{ height: ROW_H }} />
            ))}
            {/* Now line */}
            {sameDay(d, today) && <NowLine />}
            {/* Events */}
            {timed(d).map((t) => {
              const box = eventBox(t);
              if (!box) return null;
              const c = eventColor(t.status);
              const s = new Date(t.startAt!);
              const e = t.endAt ? new Date(t.endAt) : new Date(s.getTime() + 3600000);
              return (
                <button key={t.id} onClick={(ev) => { ev.stopPropagation(); onOpen(t.id); }}
                  className="absolute left-1 right-1 rounded-md px-1.5 py-1 text-left overflow-hidden shadow-sm hover:shadow-popover transition-shadow"
                  style={{ top: box.top, height: box.height, background: c.bg, borderLeft: `3px solid ${c.border}`, color: c.text }}>
                  <div className="flex items-center gap-1 text-label-sm font-medium">
                    <span className="px-1 rounded bg-white/60">{fmtTime(s)}</span>
                    <span className="px-1 rounded bg-white/60">{fmtTime(e)}</span>
                  </div>
                  <div className="text-label-md font-semibold truncate">{t.title}</div>
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
  const min = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
  if (now.getHours() < START_HOUR) return null;
  const top = (min / 60) * ROW_H;
  return (
    <div className="absolute left-0 right-0 z-10 pointer-events-none" style={{ top }}>
      <div className="h-0.5 bg-error relative"><span className="absolute -left-1 -top-1 w-2 h-2 rounded-full bg-error" /></div>
    </div>
  );
}

/* ── Month grid ───────────────────────────────────────────── */
function MonthGrid({ days, cursor, tasks, onOpen, today }: {
  days: Date[]; cursor: Date; tasks: CalendarItem[]; onOpen: (id: string) => void; today: Date;
}) {
  const byDay = (d: Date) => tasks.filter((t) => {
    const ref = t.startAt ? new Date(t.startAt) : t.dueDate ? new Date(t.dueDate) : null;
    return ref && sameDay(ref, d);
  });
  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 bg-surface-container-low border-b border-outline-variant">
        {WEEKDAYS.map((d) => (<div key={d} className="px-2 py-2 text-label-md text-on-surface-variant text-center">{d}</div>))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const items = byDay(d);
          const isToday = sameDay(d, today);
          return (
            <div key={i} className={`min-h-28 border-b border-r border-outline-variant/60 p-1.5 ${inMonth ? "bg-surface-container-lowest" : "bg-surface-container-low/40"}`}>
              <div className={`text-label-md mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? "bg-primary text-on-primary" : inMonth ? "text-on-surface" : "text-on-surface-variant/50"}`}>{d.getDate()}</div>
              <div className="flex flex-col gap-1">
                {items.slice(0, 4).map((t) => {
                  const c = eventColor(t.status);
                  return (
                    <button key={t.id} onClick={() => onOpen(t.id)} className="text-left text-label-md truncate px-1.5 py-0.5 rounded"
                      style={{ background: c.bg, color: c.text, borderLeft: `3px solid ${c.border}` }} title={`${t.projectKey} · ${t.title}`}>
                      {t.startAt ? fmtTime(new Date(t.startAt)) + " " : ""}{t.title}
                    </button>
                  );
                })}
                {items.length > 4 && <span className="text-label-sm text-on-surface-variant/60 px-1">+{items.length - 4} nữa</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── New Event modal (tạo task có lịch) ───────────────────── */
function NewEventModal({ at, onClose, onCreated }: { at: Date; onClose: () => void; onCreated: () => void }) {
  const [projects, setProjects] = useState<(Project & { wsName: string })[]>([]);
  const [projectId, setProjectId] = useState("");
  const [titleV, setTitleV] = useState("");
  const [date, setDate] = useState(ymd(at));
  const [start, setStart] = useState(fmtTime(at));
  const [end, setEnd] = useState(fmtTime(new Date(at.getTime() + 3600000)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !titleV.trim()) return;
    setBusy(true); setError(null);
    try {
      const t = await api.createTask(projectId, { title: titleV.trim() });
      await api.updateTask(t.id, {
        startAt: new Date(`${date}T${start}`).toISOString(),
        endAt: new Date(`${date}T${end}`).toISOString(),
      });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/20 p-md" onClick={onClose}>
      <form onClick={(e) => e.stopPropagation()} onSubmit={create} className="card shadow-modal p-lg w-full max-w-md">
        <div className="flex items-center justify-between mb-md">
          <h3 className="text-headline-lg">New Event</h3>
          <button type="button" onClick={onClose} className="p-1 rounded-full hover:bg-surface-container"><Icon name="close" size={20} /></button>
        </div>
        <input className="field mb-md" placeholder="Tên công việc / sự kiện" value={titleV} onChange={(e) => setTitleV(e.target.value)} autoFocus />
        <label className="text-label-md text-on-surface-variant">Dự án</label>
        <select className="field mt-1 mb-md" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (<option key={p.id} value={p.id}>{p.wsName} · {p.name}</option>))}
        </select>
        <div className="flex gap-sm mb-lg">
          <div className="flex-grow">
            <label className="text-label-md text-on-surface-variant">Ngày</label>
            <input type="date" className="field mt-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <label className="text-label-md text-on-surface-variant">Từ</label>
            <input type="time" className="field mt-1" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div>
            <label className="text-label-md text-on-surface-variant">Đến</label>
            <input type="time" className="field mt-1" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
        </div>
        {error && <p className="text-error text-body-sm mb-sm">{error}</p>}
        <div className="flex justify-end gap-sm">
          <button type="button" className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={busy || !projectId || !titleV.trim()}>Add Event</button>
        </div>
      </form>
    </div>
  );
}
