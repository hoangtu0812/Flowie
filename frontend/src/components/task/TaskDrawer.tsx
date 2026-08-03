"use client";

import { useEffect, useRef, useState } from "react";
import {
  api,
  ActivityEvent,
  Attachment,
  ChecklistItem,
  Comment,
  Label,
  CustomFieldValue,
  Member,
  Task,
  TaskDependencies,
  Worklog,
} from "@/lib/api";
import { Dialog } from "@astryxdesign/core/Dialog";
import { Selector } from "@astryxdesign/core/Selector";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import { Section } from "@astryxdesign/core/Section";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { Token } from "@astryxdesign/core/Token";
import { Banner } from "@astryxdesign/core/Banner";
import { List, ListItem } from "@astryxdesign/core/List";
import { Card } from "@astryxdesign/core/Card";
import { Avatar } from "@astryxdesign/core/Avatar";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Badge } from "@astryxdesign/core/Badge";

/** Chip trạng thái: màu do dự án đặt cho cột nên tính lúc chạy. */
function StatusChip({ s }: { s: StatusDef }) {
  return (
    <span
      style={{
        ...s.style,
        paddingInline: "var(--spacing-2)",
        paddingBlock: "var(--spacing-0-5, 2px)",
        borderRadius: "999px",
        fontSize: "0.75rem",
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}>
      {s.label}
    </span>
  );
}
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { DateInput } from "@astryxdesign/core/DateInput";
import { DateTimeInput, type ISODateTimeString } from "@astryxdesign/core/DateTimeInput";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { FileInput } from "@astryxdesign/core/FileInput";
import { Button } from "@astryxdesign/core/Button";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { StackItem } from "@astryxdesign/core/Layout";
import { IconButton } from "@astryxdesign/core/IconButton";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import Icon from "../ui/Icon";
import {
  LABEL_COLOR_KEYS,
  PRIORITIES,
  STATUSES,
  StatusDef,
  labelColor,
  toStatusDefs,
} from "@/lib/status";
import {
  formatElapsed,
  notifyTimerChanged,
  useActiveTimer,
} from "./TimerWidget";

// MoSCoW buckets (Module 3.2).
const MOSCOW = [
  { key: "must", label: "Must", cls: "bg-error text-on-error", hint: "Bắt buộc phải có" },
  { key: "should", label: "Should", cls: "bg-error-container text-on-error-container", hint: "Nên có" },
  { key: "could", label: "Could", cls: "bg-primary-container/10 text-primary", hint: "Có thì tốt" },
  { key: "wont", label: "Won't", cls: "bg-surface-container-highest text-on-surface-variant", hint: "Lần này không làm" },
];

// RICE inputs; confidence is a percentage.
const RICE_FIELDS = [
  { key: "riceReach", label: "Reach", step: 1, hint: "Số người/việc bị ảnh hưởng" },
  { key: "riceImpact", label: "Impact", step: 0.5, hint: "Mức tác động (0.25–3)" },
  { key: "riceConfidence", label: "Conf %", step: 10, hint: "Độ tin cậy (%)" },
  { key: "riceEffort", label: "Effort", step: 0.5, hint: "Công sức (person-month)" },
];

/** Human-readable file size. */
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

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

/** Kiểu ngày Astryx yêu cầu: chuỗi "YYYY-MM-DD" ở mức template literal. */
type DateValue = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;
const asDate = (v: string) => (v || undefined) as DateValue | undefined;
/** DateTimeInput dùng chuỗi branded; ép kiểu ở ranh giới vì API nhận ISO thường. */
const asDateTime = (v: string) => (v || undefined) as ISODateTimeString | undefined;

export default function TaskDrawer({
  taskId,
  onClose,
  onChanged,
  highlightCommentId,
}: {
  taskId: string;
  onClose: () => void;
  onChanged: () => void;
  /** Scroll to and highlight this comment — set when arriving from an @mention. */
  highlightCommentId?: string;
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
  const [addingLabel, setAddingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState("");
  /** The project's own workflow columns, not the built-in four. */
  const [statusDefs, setStatusDefs] = useState<StatusDef[]>(STATUSES);
  /** Resolves a status key against this project's columns. */
  const statusOf = (k: string) => statusDefs.find((s) => s.key === k) ?? statusDefs[0] ?? STATUSES[0];
  const [customFields, setCustomFields] = useState<CustomFieldValue[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState<string | null>(null);
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
  const { timer, elapsed, refresh: refreshTimer } = useActiveTimer();
  const [timerBusy, setTimerBusy] = useState(false);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Comments load after the drawer mounts, so scroll once they're on screen.
  useEffect(() => {
    if (!highlightCommentId || comments.length === 0) return;
    highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightCommentId, comments]);

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
    setAttachments(await api.listAttachments(taskId).catch(() => []));
    // The status dropdown used the four built-in columns, so any column the
    // project added in Settings was missing here.
    setStatusDefs(toStatusDefs(await api.listStatuses(d.task.projectId).catch(() => [])));
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  if (!task) {
    return (
      <Overlay onClose={onClose}>
        <Section variant="transparent" padding={5}>
          <Text color="secondary">Đang tải…</Text>
        </Section>
      </Overlay>
    );
  }

  const activeLabelIds = new Set((task.labels ?? []).map((l) => l.id));
  const checkedCount = checklist.filter((c) => c.done).length;
  const timerOnThisTask = timer?.taskId === task.id;
  const unfinishedBlockers = deps.blockedBy.filter((d) => d.status !== "done");
  const blockedIds = new Set(deps.blockedBy.map((d) => d.id));
  const depOptions = projectTasks.filter(
    (t) => t.id !== task.id && !blockedIds.has(t.id),
  );

  /**
   * Re-reads the activity feed after an edit.
   *
   * The mutators below patch local state instead of refetching, which kept the
   * drawer snappy but meant the history never showed the change you had just
   * made until you closed and reopened the task.
   */
  async function refreshActivity() {
    const d = await api.getTask(taskId).catch(() => null);
    if (d) setActivity(d.activity);
  }

  async function saveDesc() {
    await api.updateTask(task!.id, { description: descDraft });
    setEditingDesc(false);
    setTask({ ...task!, description: descDraft });
    onChanged();
    refreshActivity();
  }
  async function setPriority(p: string) {
    const u = await api.updateTask(task!.id, { priority: p });
    setTask({ ...task!, priority: u.priority });
    onChanged();
    refreshActivity();
  }
  async function setAssignee(assigneeId: string) {
    const u = await api.updateTask(task!.id, { assigneeId });
    setTask({ ...task!, assigneeId: u.assigneeId });
    onChanged();
    refreshActivity();
  }
  async function setReporter(reporterId: string) {
    const u = await api.updateTask(task!.id, { reporterId });
    setTask({ ...task!, reporterId: u.reporterId });
    onChanged();
    refreshActivity();
  }
  async function setParticipants(pids: string[]) {
    const u = await api.updateTask(task!.id, { participantIds: pids });
    setTask({ ...task!, participantIds: u.participantIds });
    onChanged();
    refreshActivity();
  }
  async function setDates(patch: { startDate?: string; dueDate?: string }) {
    const u = await api.updateTask(task!.id, patch);
    setTask({ ...task!, startDate: u.startDate, dueDate: u.dueDate });
    onChanged();
    refreshActivity();
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
        <Selector
          label={cf.name}
          isLabelHidden
          size="sm"
          value={val}
          placeholder="—"
          onChange={(v) => saveFieldValue(cf.fieldId, v ?? "", cf.fieldType)}
          options={[{ value: "", label: "—" }, ...(cf.options ?? []).map((o) => ({ value: o, label: o }))]}
        />
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
      <TextInput
        key={`${cf.fieldId}:${val}`}
        label={cf.name}
        isLabelHidden
        size="sm"
        type={type === "number" ? "text" : "text"}
        value={val}
        onChange={(v) => saveFieldValue(cf.fieldId, v, cf.fieldType)}
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
  async function uploadFile(file: File) {
    setUploading(true);
    setUploadErr(null);
    try {
      const a = await api.uploadAttachment(task!.id, file);
      setAttachments((p) => [a, ...p]);
      load();
    } catch (err) {
      setUploadErr((err as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function removeAttachment(id: string) {
    if (!window.confirm("Gỡ tệp này khỏi công việc? (Tệp vẫn còn trên SharePoint)")) return;
    await api.deleteAttachment(task!.id, id).catch((e) => setUploadErr(e.message));
    setAttachments((p) => p.filter((a) => a.id !== id));
  }
  async function setMoscow(m: string) {
    const u = await api.updateTask(task!.id, { moscow: m });
    setTask({ ...task!, moscow: u.moscow });
    onChanged();
  }
  async function setRice(patch: Partial<Record<"riceReach" | "riceImpact" | "riceConfidence" | "riceEffort", number>>) {
    // Send the whole RICE group so the server recomputes a consistent score.
    const u = await api.updateTask(task!.id, {
      riceReach: task!.riceReach ?? 0,
      riceImpact: task!.riceImpact ?? 0,
      riceConfidence: task!.riceConfidence ?? 100,
      riceEffort: task!.riceEffort ?? 0,
      ...patch,
    });
    setTask({
      ...task!,
      riceReach: u.riceReach,
      riceImpact: u.riceImpact,
      riceConfidence: u.riceConfidence,
      riceEffort: u.riceEffort,
      riceScore: u.riceScore,
    });
    onChanged();
  }
  async function startTimer() {
    setTimerBusy(true);
    try {
      await api.startTimer(task!.id, workNote.trim());
      setWorkNote("");
      await refreshTimer();
      notifyTimerChanged();
    } catch (err: any) {
      alert(err.message || "Không thể bắt đầu bộ đếm");
    } finally {
      setTimerBusy(false);
    }
  }
  async function stopTimer() {
    setTimerBusy(true);
    try {
      await api.stopTimer(workNote.trim());
      setWorkNote("");
      await refreshTimer();
      notifyTimerChanged();
      load();
    } finally {
      setTimerBusy(false);
    }
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
      <Section variant="transparent" padding={4} dividers={["bottom"]}>
        <HStack gap={2} vAlign="center">
          <Selector
            label="Trạng thái"
            isLabelHidden
            size="sm"
            value={task.status}
            onChange={(v) => moveStatus(v ?? "")}
            options={statusDefs.map((s) => ({ value: s.key, label: s.label }))}
          />
          <StackItem size="fill" />
          <IconButton label="Xóa công việc" tooltip="Xóa công việc" variant="ghost" icon={<Icon name="delete" size={20} />} clickAction={handleDelete} />
          <IconButton label="Đóng" variant="ghost" icon={<Icon name="close" size={20} />} onClick={onClose} />
        </HStack>
      </Section>

      <VStack gap={5} hAlign="stretch" isScrollable height="calc(100vh - 3.5rem)" padding={5}>
        <Heading level={2}>{task.title}</Heading>

        {/* Meta row */}
        <VStack gap={6} hAlign="stretch">
          {/* Row 1: Priority, Assignee, Reporter — Selector tự render nhãn,
              nên bỏ được nhãn thủ công và phần tử bọc quanh mỗi ô. */}
          <Grid columns={{ minWidth: 160, repeat: "fit" }} gap={5}>
              <Selector
                label="Priority"
                size="sm"
                value={task.priority}
                onChange={(v) => setPriority(v ?? "")}
                options={Object.entries(PRIORITIES).map(([k, v]) => ({ value: k, label: v.label }))}
              />
              <Selector
                label="Người phụ trách"
                size="sm"
                value={task.assigneeId ?? ""}
                placeholder="Chưa gán"
                onChange={(v) => setAssignee(v ?? "")}
                options={[{ value: "", label: "Chưa gán" }, ...members.map((m) => ({ value: m.userId, label: m.displayName || m.email }))]}
              />
              <Selector
                label="Người nhận thông tin"
                size="sm"
                value={task.reporterId ?? ""}
                placeholder="Chưa gán"
                onChange={(v) => setReporter(v ?? "")}
                options={[{ value: "", label: "Chưa gán" }, ...members.map((m) => ({ value: m.userId, label: m.displayName || m.email }))]}
              />
          </Grid>

          {/* MultiSelector thay cho dropdown checkbox tự chế: lo sẵn bàn phím,
              ARIA và click-outside — bản cũ thiếu cả ba. */}
          <MultiSelector
            label="Người cùng tham gia"
            value={task.participantIds ?? []}
            onChange={setParticipants}
            placeholder="Chưa gán"
            options={members.map((m) => ({
              value: m.userId,
              label: m.displayName || m.email,
            }))}
          />
          {/* Row 2: Expected Dates & Labels */}
          <HStack gap={5} vAlign="end" wrap="wrap">
              <DateInput
                  label="Ngày bắt đầu dự kiến"
                  size="sm"
                  value={asDate(task.startDate ? task.startDate.slice(0, 10) : "")}
                  onChange={(v) => setDates({ startDate: v ?? "" })}
                />
              <DateInput
                  label="Ngày kết thúc dự kiến"
                  size="sm"
                  value={asDate(task.dueDate ? task.dueDate.slice(0, 10) : "")}
                  onChange={(v) => setDates({ dueDate: v ?? "" })}
                />
            <VStack gap={1} hAlign="stretch">
              <Text type="label" color="secondary">Labels</Text>
              <HStack gap={1} wrap="wrap">
                {labels.length === 0 && <Text type="supporting">Chưa có label</Text>}
                {labels.map((l) => {
                  const on = activeLabelIds.has(l.id);
                  return (
                    <ToggleButton
                      key={l.id}
                      label={l.name}
                      size="sm"
                      isPressed={on}
                      onPressedChange={() => toggleLabel(l)}
                    />
                  );
                })}
                {/* Labels could be applied but never created — the project would
                    stay stuck at "Chưa có label" forever. */}
                {addingLabel ? (
                  <TextInput
                    label="Tên label"
                    isLabelHidden
                    size="sm"
                    width={128}
                    hasAutoFocus
                    placeholder="Tên label"
                    value={labelDraft}
                    onChange={setLabelDraft}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        setLabelDraft("");
                        setAddingLabel(false);
                      }
                    }}
                    onEnter={async () => {
                      const name = labelDraft.trim();
                      if (!name) {
                        setAddingLabel(false);
                        return;
                      }
                      const l = await api
                        .createLabel(task!.projectId, name, LABEL_COLOR_KEYS[labels.length % LABEL_COLOR_KEYS.length])
                        .catch(() => null);
                      if (l) {
                        setLabels((prev) => [...prev, l]);
                        await toggleLabel(l);
                      }
                      setLabelDraft("");
                      setAddingLabel(false);
                    }}
                  />
                ) : (
                  <Button label="+ Label" variant="ghost" size="sm" onClick={() => setAddingLabel(true)} />
                )}
              </HStack>
            </VStack>
          </HStack>

          {/* Row 3: Calendar / Actual Schedule */}
          <HStack gap={4} vAlign="end">
              <DateTimeInput
                label="Lịch từ"
                size="sm"
                value={asDateTime(toLocalInput(task.startAt))}
                onChange={(v) => setSchedule({ startAt: localToISO(v ?? "") })}
              />
              <Text type="supporting">đến</Text>
              <DateTimeInput
                label="Lịch đến"
                size="sm"
                value={asDateTime(toLocalInput(task.endAt))}
                onChange={(v) => setSchedule({ endAt: localToISO(v ?? "") })}
              />
          </HStack>
        </VStack>

        {/* Description */}
        <VStack gap={2} hAlign="stretch" as="section">
          <Text type="label" color="secondary">Mô tả</Text>
          {editingDesc ? (
            <VStack gap={2} hAlign="stretch">
              <TextArea
                label="Mô tả"
                isLabelHidden
                rows={4}
                value={descDraft}
                onChange={setDescDraft}
                hasAutoFocus
              />
              <HStack gap={2}>
                <Button label="Lưu" variant="primary" size="sm" clickAction={saveDesc} />
                <Button label="Huỷ" variant="ghost" size="sm" onClick={() => setEditingDesc(false)} />
              </HStack>
            </VStack>
          ) : (
            <Text color="secondary" onClick={() => setEditingDesc(true)}>
              {task.description || "Nhấn để thêm mô tả…"}
            </Text>
          )}
        </VStack>

        {/* Backlog prioritisation */}
        <VStack gap={3} hAlign="stretch" as="section">
          <Text type="label" color="secondary">Ưu tiên backlog</Text>
          <HStack gap={5} vAlign="end" wrap="wrap">
            <VStack gap={1}>
              <Text type="supporting">MoSCoW</Text>
              <HStack gap={1}>
                {MOSCOW.map((m) => {
                  const on = task.moscow === m.key;
                  return (
                    <ToggleButton
                      key={m.key}
                      label={m.label}
                      size="sm"
                      tooltip={m.hint}
                      isPressed={on}
                      onPressedChange={() => setMoscow(on ? "" : m.key)}
                    />
                  );
                })}
              </HStack>
            </VStack>

            <HStack gap={2} vAlign="end">
              {RICE_FIELDS.map((f) => (
                  <NumberInput
                    key={f.key}
                    label={f.label}
                    description={f.hint}
                    size="sm"
                    width={80}
                    min={0}
                    step={f.step}
                    value={(task as unknown as Record<string, number | undefined>)[f.key]}
                    onChange={(v) => {
                      if (v == null) return;
                      setRice({ [f.key]: v } as Partial<Task>);
                    }}
                  />
              ))}
              <VStack gap={1}>
                <Text type="supporting">RICE</Text>
                <Token label={task.riceScore != null ? task.riceScore.toFixed(1) : "—"} />
              </VStack>
            </HStack>
          </HStack>
          <Text type="supporting">
            RICE = Reach × Impact × Confidence% ÷ Effort (tính tự động).
          </Text>
        </VStack>

        {/* Dependencies */}
        <VStack gap={3} hAlign="stretch" as="section">
          <Text type="label" color="secondary">Phụ thuộc</Text>
          {unfinishedBlockers.length > 0 && (
            <Banner
              status="error"
              icon={<Icon name="block" size={16} />}
              title={`Đang bị chặn bởi ${unfinishedBlockers.length} công việc chưa hoàn thành.`}
            />
          )}
          <VStack gap={3} hAlign="stretch">
            <VStack gap={1} hAlign="stretch">
              <Text type="supporting">Bị chặn bởi (Blocked by)</Text>
              {deps.blockedBy.length === 0 ? (
                <Text type="supporting">Không có.</Text>
              ) : (
                <List hasDividers>
                  {deps.blockedBy.map((d) => (
                    <ListItem
                      key={d.id}
                      startContent={<StatusChip s={statusOf(d.status)} />}
                      label={d.title}
                      endContent={
                        <IconButton label="Gỡ phụ thuộc" tooltip="Gỡ phụ thuộc" variant="ghost" size="sm" icon={<Icon name="close" size={16} />} clickAction={() => removeDep(d.id)} />
                      }
                    />
                  ))}
                </List>
              )}
              <HStack gap={2} vAlign="center">
                <StackItem size="fill">
                  <Selector
                    label="Công việc chặn"
                    isLabelHidden
                    size="sm"
                    value={depPick}
                    placeholder="Chọn công việc chặn…"
                    onChange={(v) => setDepPick(v ?? "")}
                    options={depOptions.map((t) => ({ value: t.id, label: t.title }))}
                  />
                </StackItem>
                <IconButton label="Thêm phụ thuộc" variant="ghost" size="sm" icon={<Icon name="add" size={18} />} clickAction={addDep} />
              </HStack>
            </VStack>
            {deps.blocks.length > 0 && (
              <VStack gap={1} hAlign="stretch">
                <Text type="supporting">Đang chặn (Blocks)</Text>
                <List hasDividers>
                  {deps.blocks.map((d) => (
                    <ListItem
                      key={d.id}
                      startContent={<StatusChip s={statusOf(d.status)} />}
                      label={d.title}
                    />
                  ))}
                </List>
              </VStack>
            )}
          </VStack>
        </VStack>

        {/* Custom fields */}
        <VStack gap={3} hAlign="stretch" as="section">
          <HStack gap={2} vAlign="center">
            <Text type="label" color="secondary">Trường tùy chỉnh</Text>
            <StackItem size="fill" />
            <Button label="Quản lý" variant="ghost" size="sm" icon={<Icon name="tune" size={16} />} onClick={() => setShowFieldManager((v) => !v)} />
          </HStack>
          <VStack gap={2} hAlign="stretch">
            {customFields.length === 0 && !showFieldManager && (
              <Text type="supporting">Chưa có trường tùy chỉnh.</Text>
            )}
            {customFields.map((cf) => (
              <HStack key={cf.fieldId} gap={2} vAlign="center">
                <VStack width={128}>
                  <Text type="supporting" maxLines={1}>{cf.name}</Text>
                </VStack>
                <StackItem size="fill">{renderFieldInput(cf)}</StackItem>
                {showFieldManager && (
                  <IconButton label="Xóa trường khỏi dự án" tooltip="Xóa trường khỏi dự án" variant="ghost" size="sm" icon={<Icon name="delete" size={16} />} clickAction={() => deleteFieldDef(cf.fieldId)} />
                )}
              </HStack>
            ))}
          </VStack>
          {showFieldManager && (
            <HStack gap={2} vAlign="center" wrap="wrap">
              <TextInput
                label="Tên trường"
                isLabelHidden
                size="sm"
                width={160}
                placeholder="Tên trường"
                value={newFieldName}
                onChange={setNewFieldName}
              />
              <Selector
                label="Kiểu trường"
                isLabelHidden
                size="sm"
                value={newFieldType}
                onChange={(v) => setNewFieldType(v ?? "text")}
                options={[
                  { value: "text", label: "Text" },
                  { value: "number", label: "Number" },
                  { value: "date", label: "Date" },
                  { value: "url", label: "URL" },
                  { value: "dropdown", label: "Dropdown" },
                ]}
              />
              {newFieldType === "dropdown" && (
                <TextInput
                  label="Lựa chọn"
                  isLabelHidden
                  size="sm"
                  placeholder="Lựa chọn, cách nhau bởi dấu phẩy"
                  value={newFieldOptions}
                  onChange={setNewFieldOptions}
                />
              )}
              <Button label="Thêm trường" variant="primary" size="sm" clickAction={createField} />
            </HStack>
          )}
        </VStack>

        {/* Checklist */}
        <VStack gap={3} hAlign="stretch" as="section">
          <Text type="label" color="secondary">
            Checklist {checklist.length > 0 ? `(${checkedCount}/${checklist.length})` : ""}
          </Text>
          <VStack gap={1} hAlign="stretch">
            {checklist.map((it) => (
              <CheckboxInput
                key={it.id}
                label={it.title}
                value={it.done}
                onChange={() => toggleCheck(it)}
              />
            ))}
          </VStack>
          <HStack gap={2} vAlign="center">
            <StackItem size="fill">
            <TextInput
              label="Mục checklist mới"
              isLabelHidden
              size="sm"
              placeholder="Thêm mục checklist…"
              value={checkDraft}
              onChange={setCheckDraft}
              onEnter={addCheck}
            />
            </StackItem>
            <IconButton label="Thêm mục checklist" variant="ghost" size="sm" icon={<Icon name="add" size={18} />} clickAction={addCheck} />
          </HStack>
        </VStack>

        {/* Attachments */}
        <VStack gap={3} hAlign="stretch" as="section">
          <Text type="label" color="secondary">
            Tệp đính kèm {attachments.length > 0 ? `(${attachments.length})` : ""}
          </Text>
          {uploadErr && <Banner status="error" title={uploadErr} isDismissable onDismiss={() => setUploadErr(null)} />}
          {attachments.length === 0 ? (
            <Text type="supporting">Chưa có tệp nào.</Text>
          ) : (
            <List hasDividers>
              {attachments.map((a) => (
                <ListItem
                  key={a.id}
                  startContent={<Icon name="attach_file" size={16} />}
                  label={a.name}
                  href={a.webUrl || undefined}
                  target="_blank"
                  rel="noopener noreferrer"
                  endContent={
                    <HStack gap={2} vAlign="center">
                      <Text type="supporting">{formatBytes(a.sizeBytes)}</Text>
                      <IconButton label="Gỡ khỏi công việc" tooltip="Gỡ khỏi công việc" variant="ghost" size="sm" icon={<Icon name="close" size={16} />} clickAction={() => removeAttachment(a.id)} />
                    </HStack>
                  }
                />
              ))}
            </List>
          )}
          {/* FileInput thay cho <label> bọc <input type="file" class="hidden">:
              nó lo sẵn nhãn, trạng thái disabled và thông báo cho screen reader. */}
          <FileInput
            label={uploading ? "Đang tải lên…" : "Tải tệp lên"}
            value={null}
            isDisabled={uploading}
            onChange={(f) => {
              const file = Array.isArray(f) ? f[0] : f;
              if (file) uploadFile(file);
            }}
          />
          <Text type="supporting">Tệp được lưu vào thư mục SharePoint của dự án.</Text>
        </VStack>

        {/* Comments */}
        <VStack gap={3} hAlign="stretch" as="section">
          <Text type="label" color="secondary">Bình luận</Text>
          <VStack gap={4} hAlign="stretch">
            {comments.map((c) => {
              // A "you were mentioned" notification links straight to its
              // comment; highlight it so the reason for opening is obvious.
              const highlighted = c.id === highlightCommentId;
              return (
                  <Card
                    key={c.id}
                    id={`comment-${c.id}`}
                    ref={highlighted ? highlightRef : undefined}
                    padding={highlighted ? 3 : 0}
                    variant={highlighted ? "blue" : "transparent"}>
                    <HStack gap={2} vAlign="start">
                      <Avatar name={c.authorName || c.authorEmail || "?"} size={32} tooltip={false} />
                      <VStack gap={0.5} hAlign="stretch">
                        <HStack gap={1} vAlign="center" wrap="wrap">
                          <Text type="supporting" weight="semibold">{c.authorName || c.authorEmail}</Text>
                          <Text type="supporting">{timeAgo(c.createdAt)}</Text>
                        </HStack>
                        <Text>{c.body}</Text>
                      </VStack>
                    </HStack>
                  </Card>
              );
            })}
            {comments.length === 0 && <Text type="supporting">Chưa có bình luận.</Text>}
          </VStack>
          <HStack gap={2} vAlign="center">
            <StackItem size="fill">
              <TextInput
                label="Bình luận"
                isLabelHidden
                size="sm"
                placeholder="Viết bình luận…"
                value={commentDraft}
                onChange={setCommentDraft}
                onEnter={addComment}
              />
            </StackItem>
            <IconButton label="Gửi bình luận" variant="primary" size="sm" icon={<Icon name="send" size={18} />} clickAction={addComment} />
          </HStack>
        </VStack>

        {/* Worklog */}
        <VStack gap={3} hAlign="stretch" as="section">
          <Text type="label" color="secondary">
            Thời gian
            {worklogs.length > 0
              ? ` · tổng ${(worklogs.reduce((s, w) => s + w.minutes, 0) / 60).toFixed(1)}h`
              : ""}
          </Text>
          {/* Stopwatch */}
          <Card variant="muted" padding={3}>
            <HStack gap={2} vAlign="center">
            {timerOnThisTask ? (
              <>
                <StatusDot variant="success" label="Đang chạy" />
                <Text weight="semibold" hasTabularNumbers>
                  {formatElapsed(elapsed)}
                </Text>
                <StackItem size="fill" />
                <Button label="Dừng & ghi giờ" variant="primary" size="sm" icon={<Icon name="stop_circle" size={18} />} isDisabled={timerBusy} clickAction={stopTimer} />
              </>
            ) : (
              <>
                <Icon name="timer" size={18} />
                <Text type="supporting">
                  {timer
                    ? `Đang đếm giờ ở: ${timer.taskTitle}`
                    : "Bấm giờ trực tiếp cho công việc này"}
                </Text>
                <StackItem size="fill" />
                <Button
                  label="Bắt đầu"
                  variant="ghost"
                  size="sm"
                  icon={<Icon name="play_circle" size={18} />}
                  isDisabled={timerBusy || !!timer}
                  tooltip={timer ? "Hãy dừng bộ đếm đang chạy trước" : undefined}
                  clickAction={startTimer}
                />
              </>
            )}
            </HStack>
          </Card>

          <HStack gap={2} vAlign="center">
            <NumberInput
              label="Giờ"
              isLabelHidden
              size="sm"
              width={96}
              min={0}
              step={0.25}
              placeholder="Giờ"
              value={hoursDraft === "" ? undefined : Number(hoursDraft)}
              onChange={(v) => setHoursDraft(v == null ? "" : String(v))}
            />
            <StackItem size="fill">
              <TextInput
                label="Ghi chú worklog"
                isLabelHidden
                size="sm"
                placeholder="Ghi chú (đã làm gì)…"
                value={workNote}
                onChange={setWorkNote}
                onEnter={logTime}
              />
            </StackItem>
            <Button label="Log" variant="ghost" size="sm" icon={<Icon name="timer" size={18} />} clickAction={logTime} />
          </HStack>
          <List hasDividers>
            {worklogs.map((wl) => (
              <ListItem
                key={wl.id}
                label={`${(wl.minutes / 60).toFixed(2)}h${wl.note ? ` · ${wl.note}` : ""}`}
                endContent={
                  <HStack gap={2} vAlign="center">
                    <Text type="supporting">{new Date(wl.loggedOn).toLocaleDateString()}</Text>
                    <Badge
                      variant={wl.state === "approved" ? "success" : wl.state === "submitted" ? "info" : "neutral"}
                      label={wl.state}
                    />
                  </HStack>
                }
              />
            ))}
          </List>
        </VStack>

        {/* Activity */}
        <VStack gap={3} hAlign="stretch" as="section">
          <Text type="label" color="secondary">Hoạt động</Text>
          <VStack gap={2} hAlign="stretch">
            {activity.map((a) => (
              // vAlign="start" + wrap: diff entries ("đổi hạn chót: … → …") are
              // longer than the old one-word verbs and must not overflow.
              <HStack key={a.id} gap={2} vAlign="start">
                <Icon name="history" size={16} />
                <Text type="supporting">
                  <Text type="supporting" weight="medium">{a.actorName || "Ai đó"}</Text>{" "}
                  {verbText(a)} · {timeAgo(a.createdAt)}
                </Text>
              </HStack>
            ))}
            {activity.length === 0 && <Text type="supporting">Chưa có hoạt động.</Text>}
          </VStack>
        </VStack>
      </VStack>
    </Overlay>
  );
}

/** Vietnamese names for the fields the diff logger reports. */
const FIELD_LABELS: Record<string, string> = {
  title: "tiêu đề",
  priority: "độ ưu tiên",
  startDate: "ngày bắt đầu",
  dueDate: "hạn chót",
  startAt: "lịch bắt đầu",
  endAt: "lịch kết thúc",
  storyPoints: "story points",
  moscow: "MoSCoW",
  sprint: "sprint",
  assignee: "người thực hiện",
  reporter: "người báo cáo",
};

/** "" reads as "trống" so a cleared field doesn't render as a gap. */
const orEmpty = (v: unknown) => {
  const s = String(v ?? "").trim();
  return s === "" ? "trống" : s;
};

function verbText(a: ActivityEvent): string {
  switch (a.verb) {
    case "created":
      return "đã tạo task";
    case "status_changed":
      return `đổi trạng thái ${orEmpty(a.meta?.from)} → ${orEmpty(a.meta?.to)}`;
    case "field_changed": {
      const field = String(a.meta?.field ?? "");
      const name = FIELD_LABELS[field] ?? field;
      return `đổi ${name}: ${orEmpty(a.meta?.from)} → ${orEmpty(a.meta?.to)}`;
    }
    case "description_changed":
      return "cập nhật mô tả";
    case "participants_changed": {
      const added = (a.meta?.added as string[]) ?? [];
      const removed = (a.meta?.removed as string[]) ?? [];
      const parts: string[] = [];
      if (added.length) parts.push(`thêm ${added.join(", ")}`);
      if (removed.length) parts.push(`bỏ ${removed.join(", ")}`);
      return `người tham gia: ${parts.join(" · ")}`;
    }
    case "label_added":
      return `gắn nhãn "${String(a.meta?.label ?? "")}"`;
    case "label_removed":
      return `gỡ nhãn "${String(a.meta?.label ?? "")}"`;
    case "commented":
      return "đã bình luận";
    case "logged_time":
      return `log ${((Number(a.meta?.minutes ?? 0)) / 60).toFixed(2)}h`;
    case "dependency_added":
      return `thêm phụ thuộc "${String(a.meta?.title ?? "")}"`;
    case "dependency_removed":
      return "gỡ một phụ thuộc";
    case "attachment_added":
      return `đính kèm "${String(a.meta?.name ?? "tệp")}"`;
    case "automation":
      return "tự động hoá đã chạy";
    case "scm_linked":
      return "liên kết commit/PR";
    default:
      return a.verb;
  }
}

/**
 * Khung drawer trượt từ mép phải.
 *
 * Dùng Dialog của Astryx với `position="end"` thay vì tự dựng backdrop
 * `fixed inset-0 z-50`: Dialog lo sẵn focus trap, Escape, khoá cuộn nền và
 * `aria-modal` — những thứ bản tự chế đều thiếu.
 */
function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <Dialog
      isOpen
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      position={{ top: 0, right: 0 }}
      width={576}
      maxHeight="100vh">
      {children}
    </Dialog>
  );
}
