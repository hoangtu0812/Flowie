"use client";

import { useEffect, useState } from "react";
import {
  api,
  ActivityEvent,
  ChecklistItem,
  Comment,
  Label,
  Member,
  Task,
  Worklog,
} from "@/lib/api";
import Icon from "./Icon";
import { PRIORITIES, STATUSES, labelColor } from "@/lib/status";

function timeAgo(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString();
}

// ISO → giá trị cho <input type="datetime-local"> (giờ địa phương).
function toLocalInput(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const localToISO = (v: string) => (v ? new Date(v).toISOString() : "");

export default function TaskDrawer({
  taskId,
  onClose,
  onChanged,
}: {
  taskId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [task, setTask] = useState<Task | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [worklogs, setWorklogs] = useState<Worklog[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [hoursDraft, setHoursDraft] = useState("");
  const [workNote, setWorkNote] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [checkDraft, setCheckDraft] = useState("");
  const [descDraft, setDescDraft] = useState("");
  const [editingDesc, setEditingDesc] = useState(false);

  async function load() {
    const d = await api.getTask(taskId);
    setTask(d.task);
    setLabels(d.labels);
    setComments(d.comments);
    setChecklist(d.checklist);
    setActivity(d.activity);
    setDescDraft(d.task.description);
    setWorklogs(await api.listTaskWorklogs(taskId).catch(() => []));
    setMembers(await api.projectMembers(d.task.projectId).catch(() => []));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (!task) {
    return (
      <Overlay onClose={onClose}>
        <div className="p-lg text-on-surface-variant">Đang tải…</div>
      </Overlay>
    );
  }

  const activeLabelIds = new Set((task.labels ?? []).map((l) => l.id));
  const checkedCount = checklist.filter((c) => c.done).length;

  async function saveDesc() {
    await api.updateTask(task!.id, { description: descDraft });
    setEditingDesc(false);
    setTask({ ...task!, description: descDraft });
    onChanged();
  }
  async function setPriority(p: string) {
    const u = await api.updateTask(task!.id, { priority: p });
    setTask({ ...task!, priority: u.priority });
    onChanged();
  }
  async function setAssignee(assigneeId: string) {
    const u = await api.updateTask(task!.id, { assigneeId });
    setTask({ ...task!, assigneeId: u.assigneeId });
    onChanged();
  }
  async function setDates(patch: { startDate?: string; dueDate?: string }) {
    const u = await api.updateTask(task!.id, patch);
    setTask({ ...task!, startDate: u.startDate, dueDate: u.dueDate });
    onChanged();
  }
  async function setSchedule(patch: { startAt?: string; endAt?: string }) {
    const u = await api.updateTask(task!.id, patch);
    setTask({ ...task!, startAt: u.startAt, endAt: u.endAt });
    onChanged();
  }
  async function moveStatus(s: string) {
    await api.updateTaskStatus(task!.id, s);
    setTask({ ...task!, status: s });
    onChanged();
    load();
  }
  async function toggleLabel(l: Label) {
    const on = !activeLabelIds.has(l.id);
    await api.setTaskLabel(task!.id, l.id, on);
    const next = on
      ? [...(task!.labels ?? []), l]
      : (task!.labels ?? []).filter((x) => x.id !== l.id);
    setTask({ ...task!, labels: next });
    onChanged();
  }
  async function addComment() {
    if (!commentDraft.trim()) return;
    const c = await api.addComment(task!.id, commentDraft.trim());
    setComments((p) => [...p, c]);
    setCommentDraft("");
    load();
  }
  async function addCheck() {
    if (!checkDraft.trim()) return;
    const it = await api.addChecklistItem(task!.id, checkDraft.trim());
    setChecklist((p) => [...p, it]);
    setCheckDraft("");
    onChanged();
  }
  async function toggleCheck(it: ChecklistItem) {
    await api.toggleChecklistItem(task!.id, it.id, !it.done);
    setChecklist((p) => p.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)));
    onChanged();
  }
  async function logTime() {
    const hours = parseFloat(hoursDraft.replace(",", "."));
    if (!hours || hours <= 0) return;
    const wl = await api.logWork(task!.id, {
      minutes: Math.round(hours * 60),
      note: workNote.trim(),
    });
    setWorklogs((p) => [wl, ...p]);
    setHoursDraft("");
    setWorkNote("");
    load();
  }

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between px-lg h-14 border-b border-outline-variant">
        <div className="flex items-center gap-sm">
          <select
            value={task.status}
            onChange={(e) => moveStatus(e.target.value)}
            className="text-body-sm border border-outline-variant rounded-md px-2 py-1 text-on-surface-variant"
          >
            {STATUSES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-container">
          <Icon name="close" size={20} />
        </button>
      </div>

      <div className="overflow-y-auto p-lg flex flex-col gap-lg" style={{ height: "calc(100vh - 3.5rem)" }}>
        <h2 className="text-headline-lg text-on-surface">{task.title}</h2>

        {/* Meta row */}
        <div className="flex flex-wrap gap-lg">
          <div>
            <p className="text-label-sm uppercase text-on-surface-variant mb-1">Priority</p>
            <select
              value={task.priority}
              onChange={(e) => setPriority(e.target.value)}
              className="text-body-sm border border-outline-variant rounded-md px-2 py-1"
            >
              {Object.entries(PRIORITIES).map(([k, v]) => (
                <option key={k} value={k}>{v.label}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-label-sm uppercase text-on-surface-variant mb-1">Người phụ trách</p>
            <select
              value={task.assigneeId ?? ""}
              onChange={(e) => setAssignee(e.target.value)}
              className="text-body-sm border border-outline-variant rounded-md px-2 py-1 max-w-44"
            >
              <option value="">Chưa gán</option>
              {members.map((m) => (
                <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>
              ))}
            </select>
          </div>
          <div>
            <p className="text-label-sm uppercase text-on-surface-variant mb-1">Bắt đầu</p>
            <input
              type="date"
              value={task.startDate ? task.startDate.slice(0, 10) : ""}
              onChange={(e) => setDates({ startDate: e.target.value })}
              className="text-body-sm border border-outline-variant rounded-md px-2 py-1"
            />
          </div>
          <div>
            <p className="text-label-sm uppercase text-on-surface-variant mb-1">Hạn</p>
            <input
              type="date"
              value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
              onChange={(e) => setDates({ dueDate: e.target.value })}
              className="text-body-sm border border-outline-variant rounded-md px-2 py-1"
            />
          </div>
          <div>
            <p className="text-label-sm uppercase text-on-surface-variant mb-1">Lịch từ</p>
            <input
              type="datetime-local"
              value={toLocalInput(task.startAt)}
              onChange={(e) => setSchedule({ startAt: localToISO(e.target.value) })}
              className="text-body-sm border border-outline-variant rounded-md px-2 py-1"
            />
          </div>
          <div>
            <p className="text-label-sm uppercase text-on-surface-variant mb-1">đến</p>
            <input
              type="datetime-local"
              value={toLocalInput(task.endAt)}
              onChange={(e) => setSchedule({ endAt: localToISO(e.target.value) })}
              className="text-body-sm border border-outline-variant rounded-md px-2 py-1"
            />
          </div>
          <div className="min-w-40">
            <p className="text-label-sm uppercase text-on-surface-variant mb-1">Labels</p>
            <div className="flex flex-wrap gap-1">
              {labels.length === 0 && <span className="text-body-sm text-on-surface-variant/60">Chưa có label</span>}
              {labels.map((l) => {
                const on = activeLabelIds.has(l.id);
                return (
                  <button
                    key={l.id}
                    onClick={() => toggleLabel(l)}
                    className={`chip ${on ? labelColor(l.color) : "bg-surface-container-high text-on-surface-variant/60"} ${on ? "" : "opacity-60"}`}
                  >
                    {l.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Description */}
        <section>
          <p className="text-label-sm uppercase text-on-surface-variant mb-1">Mô tả</p>
          {editingDesc ? (
            <div>
              <textarea
                className="field"
                rows={4}
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                autoFocus
              />
              <div className="flex gap-sm mt-sm">
                <button className="btn-primary" onClick={saveDesc}>Lưu</button>
                <button className="btn-ghost" onClick={() => setEditingDesc(false)}>Huỷ</button>
              </div>
            </div>
          ) : (
            <div
              className="text-body-md text-on-surface-variant whitespace-pre-wrap min-h-10 cursor-text hover:bg-surface-container-low rounded-lg p-sm -m-sm"
              onClick={() => setEditingDesc(true)}
            >
              {task.description || "Nhấn để thêm mô tả…"}
            </div>
          )}
        </section>

        {/* Checklist */}
        <section>
          <p className="text-label-sm uppercase text-on-surface-variant mb-sm">
            Checklist {checklist.length > 0 && <span className="text-on-surface-variant/60">({checkedCount}/{checklist.length})</span>}
          </p>
          <div className="flex flex-col gap-1">
            {checklist.map((it) => (
              <label key={it.id} className="flex items-center gap-sm py-1 cursor-pointer">
                <input type="checkbox" checked={it.done} onChange={() => toggleCheck(it)} className="w-4 h-4 accent-primary" />
                <span className={`text-body-md ${it.done ? "line-through text-on-surface-variant/60" : ""}`}>{it.title}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-sm mt-sm">
            <input
              className="field"
              placeholder="Thêm mục checklist…"
              value={checkDraft}
              onChange={(e) => setCheckDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addCheck()}
            />
            <button className="btn-ghost" onClick={addCheck}><Icon name="add" size={18} /></button>
          </div>
        </section>

        {/* Comments */}
        <section>
          <p className="text-label-sm uppercase text-on-surface-variant mb-sm">Bình luận</p>
          <div className="flex flex-col gap-md">
            {comments.map((c) => (
              <div key={c.id} className="flex gap-sm">
                <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center text-label-sm flex-shrink-0">
                  {(c.authorName || c.authorEmail || "?").slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-grow">
                  <p className="text-body-sm">
                    <span className="font-semibold text-on-surface">{c.authorName || c.authorEmail}</span>{" "}
                    <span className="text-on-surface-variant/60">{timeAgo(c.createdAt)}</span>
                  </p>
                  <p className="text-body-md text-on-surface whitespace-pre-wrap">{c.body}</p>
                </div>
              </div>
            ))}
            {comments.length === 0 && <p className="text-body-sm text-on-surface-variant/60">Chưa có bình luận.</p>}
          </div>
          <div className="flex gap-sm mt-md">
            <input
              className="field"
              placeholder="Viết bình luận…"
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addComment()}
            />
            <button className="btn-primary" onClick={addComment}><Icon name="send" size={18} /></button>
          </div>
        </section>

        {/* Worklog */}
        <section>
          <p className="text-label-sm uppercase text-on-surface-variant mb-sm">
            Thời gian
            {worklogs.length > 0 && (
              <span className="text-on-surface-variant/60">
                {" "}· tổng {(worklogs.reduce((s, w) => s + w.minutes, 0) / 60).toFixed(1)}h
              </span>
            )}
          </p>
          <div className="flex gap-sm mb-sm">
            <input
              className="field w-24"
              type="number"
              step="0.25"
              min={0}
              placeholder="Giờ"
              value={hoursDraft}
              onChange={(e) => setHoursDraft(e.target.value)}
            />
            <input
              className="field flex-grow"
              placeholder="Ghi chú (đã làm gì)…"
              value={workNote}
              onChange={(e) => setWorkNote(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && logTime()}
            />
            <button className="btn-ghost" onClick={logTime}><Icon name="timer" size={18} /> Log</button>
          </div>
          <div className="flex flex-col gap-1">
            {worklogs.map((wl) => (
              <div key={wl.id} className="flex items-center justify-between text-body-sm py-1 border-b border-outline-variant/50 last:border-0">
                <span className="text-on-surface">{(wl.minutes / 60).toFixed(2)}h {wl.note && <span className="text-on-surface-variant">· {wl.note}</span>}</span>
                <span className="flex items-center gap-sm">
                  <span className="text-on-surface-variant/60">{new Date(wl.loggedOn).toLocaleDateString()}</span>
                  <span className={`chip ${wl.state === "approved" ? "bg-success-container text-success" : wl.state === "submitted" ? "bg-primary-fixed text-on-primary-fixed-variant" : "bg-surface-container-high text-on-surface-variant"}`}>{wl.state}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Activity */}
        <section>
          <p className="text-label-sm uppercase text-on-surface-variant mb-sm">Hoạt động</p>
          <div className="flex flex-col gap-2">
            {activity.map((a) => (
              <div key={a.id} className="flex items-center gap-sm text-body-sm text-on-surface-variant">
                <Icon name="history" size={16} />
                <span className="font-medium text-on-surface">{a.actorName || "Ai đó"}</span>
                <span>{verbText(a)}</span>
                <span className="text-on-surface-variant/50">· {timeAgo(a.createdAt)}</span>
              </div>
            ))}
            {activity.length === 0 && <p className="text-body-sm text-on-surface-variant/60">Chưa có hoạt động.</p>}
          </div>
        </section>
      </div>
    </Overlay>
  );
}

function verbText(a: ActivityEvent): string {
  switch (a.verb) {
    case "created":
      return "đã tạo task";
    case "status_changed":
      return `đổi trạng thái ${String(a.meta?.from ?? "")} → ${String(a.meta?.to ?? "")}`;
    case "commented":
      return "đã bình luận";
    case "logged_time":
      return `log ${((Number(a.meta?.minutes ?? 0)) / 60).toFixed(2)}h`;
    default:
      return a.verb;
  }
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/20" onClick={onClose}>
      <div
        className="w-full max-w-xl bg-surface-container-lowest h-full shadow-modal animate-[slidein_0.2s_ease]"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
