"use client";

import { useEffect, useState } from "react";
import {
  api,
  ActivityEvent,
  ChecklistItem,
  Comment,
  Label,
  CustomFieldValue,
  Member,
  Task,
  TaskDependencies,
  Worklog,
} from "@/lib/api";
import Icon from "../ui/Icon";
import { PRIORITIES, STATUSES, labelColor, statusByKey } from "@/lib/status";

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
  const [deps, setDeps] = useState<TaskDependencies>({ blockedBy: [], blocks: [] });
  const [projectTasks, setProjectTasks] = useState<Task[]>([]);
  const [depPick, setDepPick] = useState("");
  const [customFields, setCustomFields] = useState<CustomFieldValue[]>([]);
  const [showFieldManager, setShowFieldManager] = useState(false);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState("text");
  const [newFieldOptions, setNewFieldOptions] = useState("");
  const [hoursDraft, setHoursDraft] = useState("");
  const [showPartMenu, setShowPartMenu] = useState(false);
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
    setDeps(d.dependencies ?? { blockedBy: [], blocks: [] });
    setProjectTasks(await api.listTasks(d.task.projectId).catch(() => []));
    setCustomFields(d.customFields ?? []);
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
  const unfinishedBlockers = deps.blockedBy.filter((d) => d.status !== "done");
  const blockedIds = new Set(deps.blockedBy.map((d) => d.id));
  const depOptions = projectTasks.filter(
    (t) => t.id !== task.id && !blockedIds.has(t.id),
  );

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
  async function setReporter(reporterId: string) {
    const u = await api.updateTask(task!.id, { reporterId });
    setTask({ ...task!, reporterId: u.reporterId });
    onChanged();
  }
  async function setParticipants(pids: string[]) {
    const u = await api.updateTask(task!.id, { participantIds: pids });
    setTask({ ...task!, participantIds: u.participantIds });
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
    const unfinished = deps.blockedBy.filter((d) => d.status !== "done");
    if ((s === "in_progress" || s === "in_review") && unfinished.length > 0) {
      const ok = window.confirm(
        `Công việc này đang bị chặn bởi ${unfinished.length} task chưa hoàn thành:\n` +
          unfinished.map((d) => `• ${d.title}`).join("\n") +
          `\n\nVẫn tiếp tục chuyển trạng thái?`,
      );
      if (!ok) return;
    }
    await api.updateTaskStatus(task!.id, s);
    setTask({ ...task!, status: s });
    onChanged();
    load();
  }
  async function addDep() {
    if (!depPick) return;
    try {
      const next = await api.addDependency(task!.id, depPick);
      setDeps(next);
      setDepPick("");
      load();
    } catch (err: any) {
      alert(err.message || "Không thể thêm phụ thuộc");
    }
  }
  async function removeDep(dependsOnId: string) {
    await api.removeDependency(task!.id, dependsOnId);
    setDeps((p) => ({
      ...p,
      blockedBy: p.blockedBy.filter((d) => d.id !== dependsOnId),
    }));
    load();
  }
  async function saveFieldValue(fieldId: string, raw: string, fieldType: string) {
    let value: unknown = raw;
    if (raw === "") value = null;
    else if (fieldType === "number") {
      const n = parseFloat(raw);
      value = isNaN(n) ? null : n;
    }
    const res = await api.setTaskCustomField(task!.id, fieldId, value);
    setCustomFields(res.customFields);
    onChanged();
  }
  async function createField() {
    const name = newFieldName.trim();
    if (!name) return;
    const options =
      newFieldType === "dropdown"
        ? newFieldOptions.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined;
    await api.createCustomField(task!.projectId, { name, fieldType: newFieldType, options });
    setNewFieldName("");
    setNewFieldOptions("");
    load();
  }
  async function deleteFieldDef(fieldId: string) {
    if (!window.confirm("Xóa trường này khỏi toàn bộ dự án?")) return;
    await api.deleteCustomField(task!.projectId, fieldId);
    load();
  }
  function renderFieldInput(cf: CustomFieldValue) {
    const val = cf.value == null ? "" : String(cf.value);
    const cls = "text-body-sm border border-outline-variant rounded-md px-2 py-1 flex-grow max-w-xs";
    if (cf.fieldType === "dropdown") {
      return (
        <select
          className={cls}
          value={val}
          onChange={(e) => saveFieldValue(cf.fieldId, e.target.value, cf.fieldType)}
        >
          <option value="">—</option>
          {(cf.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      );
    }
    const type =
      cf.fieldType === "number"
        ? "number"
        : cf.fieldType === "date"
          ? "date"
          : cf.fieldType === "url"
            ? "url"
            : "text";
    return (
      <input
        key={`${cf.fieldId}:${val}`}
        type={type}
        className={cls}
        defaultValue={val}
        onBlur={(e) => saveFieldValue(cf.fieldId, e.target.value, cf.fieldType)}
      />
    );
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

  async function handleDelete() {
    if (!window.confirm("Bạn có chắc chắn muốn xóa công việc này? Hành động này không thể hoàn tác.")) return;
    try {
      await api.deleteTask(task!.id);
      onChanged();
      onClose();
    } catch (err: any) {
      alert(`Lỗi khi xóa: ${err.message}`);
    }
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
        <div className="flex items-center gap-2">
          <button onClick={handleDelete} className="p-2 rounded-full hover:bg-red-50 text-red-500 transition-colors" title="Xóa công việc">
            <Icon name="delete" size={20} />
          </button>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-container transition-colors">
            <Icon name="close" size={20} />
          </button>
        </div>
      </div>

      <div className="overflow-y-auto p-lg flex flex-col gap-lg" style={{ height: "calc(100vh - 3.5rem)" }}>
        <h2 className="text-headline-lg text-on-surface">{task.title}</h2>

        {/* Meta row */}
        <div className="flex flex-col gap-6">
          {/* Row 1: Priority, Assignee, Reporter */}
          <div className="flex flex-wrap gap-lg">
            <div className="w-1/4 min-w-[120px]">
              <p className="text-label-sm uppercase text-on-surface-variant mb-1">Priority</p>
              <select
                value={task.priority}
                onChange={(e) => setPriority(e.target.value)}
                className="text-body-sm border border-outline-variant rounded-md px-2 py-1 w-full"
              >
                {Object.entries(PRIORITIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="w-1/4 min-w-[160px]">
              <p className="text-label-sm uppercase text-on-surface-variant mb-1">Người phụ trách</p>
              <select
                value={task.assigneeId ?? ""}
                onChange={(e) => setAssignee(e.target.value)}
                className="text-body-sm border border-outline-variant rounded-md px-2 py-1 w-full max-w-[200px]"
              >
                <option value="">Chưa gán</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>
                ))}
              </select>
            </div>
            <div className="w-1/4 min-w-[160px]">
              <p className="text-label-sm uppercase text-on-surface-variant mb-1">Người nhận thông tin</p>
              <select
                value={task.reporterId ?? ""}
                onChange={(e) => setReporter(e.target.value)}
                className="text-body-sm border border-outline-variant rounded-md px-2 py-1 w-full max-w-[200px]"
              >
                <option value="">Chưa gán</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-lg">
            <div className="w-full min-w-[160px] relative">
              <p className="text-label-sm uppercase text-on-surface-variant mb-1">Người cùng tham gia</p>
              <div 
                className="text-body-sm border border-outline-variant rounded-md px-2 py-1 w-full max-w-md cursor-pointer truncate bg-white flex flex-wrap gap-1"
                onClick={() => setShowPartMenu(!showPartMenu)}
              >
                {task.participantIds && task.participantIds.length > 0 
                  ? members.filter(m => task.participantIds?.includes(m.userId)).map(m => (
                      <span key={m.userId} className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-sm text-xs font-medium border border-blue-100">
                        {m.displayName || m.email}
                      </span>
                    ))
                  : "Chưa gán"}
              </div>
              
              {showPartMenu && (
                <div className="absolute left-0 top-[100%] mt-1 bg-white border border-outline-variant rounded-md shadow-lg z-50 max-h-48 overflow-y-auto min-w-[200px]">
                  {members.map(m => (
                    <label key={m.userId} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input 
                        type="checkbox" 
                        className="rounded"
                        checked={task.participantIds?.includes(m.userId) || false}
                        onChange={(e) => {
                          const current = task.participantIds || [];
                          if (e.target.checked) setParticipants([...current, m.userId]);
                          else setParticipants(current.filter(id => id !== m.userId));
                        }}
                      />
                      <span className="text-body-sm truncate">{m.displayName || m.email}</span>
                    </label>
                  ))}
                  {members.length === 0 && <div className="px-3 py-1.5 text-body-sm text-gray-500">Không có thành viên</div>}
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Expected Dates & Labels */}
          <div className="flex flex-wrap gap-lg items-end">
            <div className="flex gap-4">
              <div>
                <p className="text-label-sm uppercase text-on-surface-variant mb-1">Ngày bắt đầu dự kiến</p>
                <input
                  type="date"
                  value={task.startDate ? task.startDate.slice(0, 10) : ""}
                  onChange={(e) => setDates({ startDate: e.target.value })}
                  className="text-body-sm border border-outline-variant rounded-md px-2 py-1 w-full"
                />
              </div>
              <div>
                <p className="text-label-sm uppercase text-on-surface-variant mb-1">Ngày kết thúc dự kiến</p>
                <input
                  type="date"
                  value={task.dueDate ? task.dueDate.slice(0, 10) : ""}
                  onChange={(e) => setDates({ dueDate: e.target.value })}
                  className="text-body-sm border border-outline-variant rounded-md px-2 py-1 w-full"
                />
              </div>
            </div>
            
            <div className="min-w-40 flex-1">
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

          {/* Row 3: Calendar / Actual Schedule */}
          <div className="flex gap-4 items-center">
            <div>
              <p className="text-label-sm uppercase text-on-surface-variant mb-1">Lịch từ</p>
              <input
                type="datetime-local"
                value={toLocalInput(task.startAt)}
                onChange={(e) => setSchedule({ startAt: localToISO(e.target.value) })}
                className="text-body-sm border border-outline-variant rounded-md px-2 py-1 w-full"
              />
            </div>
            <div className="mt-6 text-on-surface-variant px-2">đến</div>
            <div>
              <p className="text-label-sm uppercase text-on-surface-variant mb-1">&nbsp;</p>
              <input
                type="datetime-local"
                value={toLocalInput(task.endAt)}
                onChange={(e) => setSchedule({ endAt: localToISO(e.target.value) })}
                className="text-body-sm border border-outline-variant rounded-md px-2 py-1 w-full"
              />
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

        {/* Dependencies */}
        <section>
          <p className="text-label-sm uppercase text-on-surface-variant mb-sm">Phụ thuộc</p>
          {unfinishedBlockers.length > 0 && (
            <div className="flex items-start gap-sm mb-sm px-sm py-2 rounded-lg bg-error-container/40 text-on-error-container text-body-sm">
              <Icon name="block" size={16} className="mt-0.5" />
              <span>Đang bị chặn bởi {unfinishedBlockers.length} công việc chưa hoàn thành.</span>
            </div>
          )}
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-body-sm text-on-surface-variant mb-1">Bị chặn bởi (Blocked by)</p>
              {deps.blockedBy.length === 0 && (
                <p className="text-body-sm text-on-surface-variant/60">Không có.</p>
              )}
              <div className="flex flex-col gap-1">
                {deps.blockedBy.map((d) => (
                  <div key={d.id} className="flex items-center justify-between gap-sm text-body-sm border border-outline-variant/50 rounded-md px-2 py-1">
                    <span className="flex items-center gap-sm min-w-0">
                      <span className={`chip ${statusByKey(d.status).chipBg} ${statusByKey(d.status).chipText}`}>{statusByKey(d.status).label}</span>
                      <span className="truncate">{d.title}</span>
                    </span>
                    <button onClick={() => removeDep(d.id)} className="p-1 rounded-full hover:bg-surface-container text-on-surface-variant" title="Gỡ phụ thuộc">
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-sm mt-sm">
                <select className="field flex-grow" value={depPick} onChange={(e) => setDepPick(e.target.value)}>
                  <option value="">Chọn công việc chặn…</option>
                  {depOptions.map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
                </select>
                <button className="btn-ghost" onClick={addDep}><Icon name="add" size={18} /></button>
              </div>
            </div>
            {deps.blocks.length > 0 && (
              <div>
                <p className="text-body-sm text-on-surface-variant mb-1">Đang chặn (Blocks)</p>
                <div className="flex flex-col gap-1">
                  {deps.blocks.map((d) => (
                    <div key={d.id} className="flex items-center gap-sm text-body-sm border border-outline-variant/50 rounded-md px-2 py-1">
                      <span className={`chip ${statusByKey(d.status).chipBg} ${statusByKey(d.status).chipText}`}>{statusByKey(d.status).label}</span>
                      <span className="truncate">{d.title}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Custom fields */}
        <section>
          <div className="flex items-center justify-between mb-sm">
            <p className="text-label-sm uppercase text-on-surface-variant">Trường tùy chỉnh</p>
            <button
              className="text-body-sm text-primary flex items-center gap-1"
              onClick={() => setShowFieldManager((v) => !v)}
            >
              <Icon name="tune" size={16} /> Quản lý
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {customFields.length === 0 && !showFieldManager && (
              <p className="text-body-sm text-on-surface-variant/60">Chưa có trường tùy chỉnh.</p>
            )}
            {customFields.map((cf) => (
              <div key={cf.fieldId} className="flex items-center gap-sm">
                <span className="w-32 text-body-sm text-on-surface-variant truncate">{cf.name}</span>
                {renderFieldInput(cf)}
                {showFieldManager && (
                  <button
                    onClick={() => deleteFieldDef(cf.fieldId)}
                    className="p-1 rounded-full hover:bg-red-50 text-red-500"
                    title="Xóa trường khỏi dự án"
                  >
                    <Icon name="delete" size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {showFieldManager && (
            <div className="mt-sm flex flex-wrap gap-sm items-center border-t border-outline-variant/50 pt-sm">
              <input
                className="field w-40"
                placeholder="Tên trường"
                value={newFieldName}
                onChange={(e) => setNewFieldName(e.target.value)}
              />
              <select
                className="field w-32"
                value={newFieldType}
                onChange={(e) => setNewFieldType(e.target.value)}
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="date">Date</option>
                <option value="url">URL</option>
                <option value="dropdown">Dropdown</option>
              </select>
              {newFieldType === "dropdown" && (
                <input
                  className="field flex-grow"
                  placeholder="Lựa chọn, cách nhau bởi dấu phẩy"
                  value={newFieldOptions}
                  onChange={(e) => setNewFieldOptions(e.target.value)}
                />
              )}
              <button className="btn-primary" onClick={createField}>Thêm trường</button>
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
    case "dependency_added":
      return `thêm phụ thuộc "${String(a.meta?.title ?? "")}"`;
    case "dependency_removed":
      return "gỡ một phụ thuộc";
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
