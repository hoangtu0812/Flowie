"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { api, TimesheetEntry, Project } from "@/lib/api";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Monday=0
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}
function fmt(d: Date) {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const DAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

export default function TimesheetPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const from = fmt(weekStart);
  const to = fmt(addDays(weekStart, 6));

  useEffect(() => {
    api.listWorkspaces().then(wss => {
      if (wss.length > 0) {
        api.listProjects(wss[0].id).then(ps => setProjects(ps.filter(p => p.role === "owner")));
      }
    }).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!selectedProject) {
      api.myTimesheet(from, to).then((r) => setEntries(r.entries)).catch(() => setEntries([]));
    } else {
      api.projectTimesheet(selectedProject, from, to).then((r) => setEntries(r.entries)).catch(() => setEntries([]));
    }
  }, [from, to, selectedProject]);

  useEffect(() => { load(); }, [load]);

  // Gộp theo task (và user nếu xem team)
  const rows = useMemo(() => {
    const map = new Map<string, { title: string; projectKey: string; user: string; days: number[]; total: number }>();
    for (const e of entries) {
      const key = selectedProject ? e.userId + "|" + e.taskId : e.taskId;
      if (!map.has(key)) map.set(key, { 
        title: e.taskTitle, 
        projectKey: e.projectKey, 
        user: e.userDisplayName || e.userEmail || "Unknown",
        days: [0, 0, 0, 0, 0, 0, 0], 
        total: 0 
      });
      const row = map.get(key)!;
      const di = (new Date(e.loggedOn).getDay() + 6) % 7;
      const h = e.minutes / 60;
      row.days[di] += h;
      row.total += h;
    }
    return Array.from(map.values());
  }, [entries]);

  const dayTotals = useMemo(() => {
    const t = [0, 0, 0, 0, 0, 0, 0];
    rows.forEach((r) => r.days.forEach((h, i) => (t[i] += h)));
    return t;
  }, [rows]);
  const grand = dayTotals.reduce((a, b) => a + b, 0);
  const anyDraft = entries.some((e) => e.state === "draft");

  async function submit() {
    setSubmitting(true);
    await api.submitTimesheet(from, to).catch(() => {});
    await load();
    setSubmitting(false);
  }

  function exportWeek() {
    const lines = [];
    if (selectedProject) lines.push("Thành viên,Dự án,Công việc,T2,T3,T4,T5,T6,T7,CN,Tổng (giờ)");
    else lines.push("Dự án,Công việc,T2,T3,T4,T5,T6,T7,CN,Tổng (giờ)");
    rows.forEach(r => {
      const d = r.days.map(x => (x > 0 ? x.toFixed(2) : "")).join(",");
      if (selectedProject) lines.push(`"${r.user}","${r.projectKey}","${r.title}",${d},${r.total.toFixed(2)}`);
      else lines.push(`"${r.projectKey}","${r.title}",${d},${r.total.toFixed(2)}`);
    });
    downloadCSV(lines, `timesheet_${from}_${to}.csv`);
  }

  async function exportMonth() {
    const mStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
    const mEnd = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0);
    const f = fmt(mStart);
    const t = fmt(mEnd);
    const r = selectedProject ? await api.projectTimesheet(selectedProject, f, t) : await api.myTimesheet(f, t);
    
    const map = new Map<string, any>();
    for (const e of r.entries) {
      const key = selectedProject ? e.userId + "|" + e.taskId : e.taskId;
      if (!map.has(key)) map.set(key, { user: e.userDisplayName || e.userEmail || "Unknown", project: e.projectKey, task: e.taskTitle, total: 0 });
      map.get(key).total += e.minutes / 60;
    }
    
    const lines = [];
    if (selectedProject) lines.push("Thành viên,Dự án,Công việc,Tổng (giờ)");
    else lines.push("Dự án,Công việc,Tổng (giờ)");
    for (const r of Array.from(map.values())) {
      if (selectedProject) lines.push(`"${r.user}","${r.project}","${r.task}",${r.total.toFixed(2)}`);
      else lines.push(`"${r.project}","${r.task}",${r.total.toFixed(2)}`);
    }
    downloadCSV(lines, `timesheet_thang_${f.slice(0, 7)}.csv`);
  }

  function downloadCSV(lines: string[], filename: string) {
    const csv = "\uFEFF" + lines.join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    link.download = filename;
    link.click();
  }

  const actions = (
    <div className="flex items-center gap-2">
      <button className="btn-secondary" onClick={exportWeek}>
        <Icon name="download" size={18} /> Xuất Tuần
      </button>
      <button className="btn-secondary" onClick={exportMonth}>
        <Icon name="download" size={18} /> Xuất Tháng
      </button>
      {!selectedProject && (
        <button className="btn-primary" disabled={!anyDraft || submitting} onClick={submit}>
          <Icon name="send" size={18} /> Trình duyệt
        </button>
      )}
    </div>
  );

  return (
    <AppShell title="Timesheet" actions={actions}>
      <div className="p-lg max-w-6xl">
        <div className="flex items-center justify-between mb-lg">
          <h2 className="text-headline-md">Bảng chấm công</h2>
          <div className="flex items-center gap-sm">
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="text-body-sm border border-outline-variant rounded-md px-2 py-1 bg-white"
            >
              <option value="">Cá nhân (My Timesheet)</option>
              {projects.map(p => <option key={p.id} value={p.id}>[Team] {p.name}</option>)}
            </select>
            <div className="w-px h-6 bg-outline-variant mx-2"></div>
            <button className="btn-ghost" onClick={() => setWeekStart((d) => addDays(d, -7))}>
              <Icon name="chevron_left" size={18} />
            </button>
            <span className="text-body-md text-on-surface-variant">
              {weekStart.toLocaleDateString()} – {addDays(weekStart, 6).toLocaleDateString()}
            </span>
            <button className="btn-ghost" onClick={() => setWeekStart((d) => addDays(d, 7))}>
              <Icon name="chevron_right" size={18} />
            </button>
            <button className="btn-ghost" onClick={() => setWeekStart(startOfWeek(new Date()))}>Tuần này</button>
          </div>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant">
                {selectedProject && <th className="text-left px-md py-2 font-medium">Thành viên</th>}
                <th className="text-left px-md py-2 font-medium">Công việc</th>
                {weekDays.map((d, i) => (
                  <th key={i} className="px-2 py-2 text-center font-medium w-16">
                    <div>{DAYS[i]}</div>
                    <div className="text-label-sm text-on-surface-variant/60">{d.getDate()}</div>
                  </th>
                ))}
                <th className="px-md py-2 text-right font-medium w-20">Tổng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {rows.map((r, ri) => (
                <tr key={ri} className="hover:bg-surface-container-low">
                  {selectedProject && (
                    <td className="px-md py-2 font-medium">{r.user}</td>
                  )}
                  <td className="px-md py-2">
                    <span className="chip bg-primary-container/10 text-primary mr-1">{r.projectKey}</span>
                    {r.title}
                  </td>
                  {r.days.map((h, i) => (
                    <td key={i} className="px-2 py-2 text-center text-on-surface-variant">
                      {h > 0 ? h.toFixed(2) : "·"}
                    </td>
                  ))}
                  <td className="px-md py-2 text-right font-semibold">{r.total.toFixed(2)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={selectedProject ? 10 : 9} className="px-md py-xl text-center text-on-surface-variant/60">
                    Không có bản ghi worklog nào trong tuần này.
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="bg-surface-container-low font-semibold">
                <tr>
                  <td colSpan={selectedProject ? 2 : 1} className="px-md py-2 text-right">Tổng ngày</td>
                  {dayTotals.map((h, i) => (
                    <td key={i} className={`px-2 py-2 text-center ${h > 8 ? "text-error" : "text-on-surface"}`}>
                      {h > 0 ? h.toFixed(1) : "·"}
                    </td>
                  ))}
                  <td className="px-md py-2 text-right text-primary">{grand.toFixed(1)}h</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <p className="text-body-sm text-on-surface-variant/70 mt-sm">
          Ô ngày quá 8h được tô đỏ. “Trình duyệt” chuyển các bản ghi nháp sang chờ duyệt.
        </p>
      </div>
    </AppShell>
  );
}
