"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Section } from "@astryxdesign/core/Section";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { DateInput } from "@astryxdesign/core/DateInput";
import { Selector } from "@astryxdesign/core/Selector";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Token } from "@astryxdesign/core/Token";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { api, Project, Sprint, Task } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import ProjectTabs from "@/components/layout/ProjectTabs";
import TaskDrawer from "@/components/task/TaskDrawer";
import { PRIORITIES } from "@/lib/status";

/** Kiểu ngày Astryx yêu cầu: chuỗi "YYYY-MM-DD" ở mức template literal. */
type DateValue = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;
const asDate = (s: string) => (s || undefined) as DateValue | undefined;

type BadgeVariant = "neutral" | "info" | "success";
const STATE_VARIANT: Record<string, BadgeVariant> = {
  planned: "neutral",
  active: "info",
  completed: "success",
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
    await Promise.all(ids.map((tid) => api.setTaskSprint(tid, sprintId))).catch((e) =>
      setError((e as Error).message),
    );
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
    <Button
      label="Sprint mới"
      variant="primary"
      size="sm"
      icon={<Icon name="add" size={20} />}
      onClick={() => setCreating(true)}
    />
  );

  return (
    <AppShell
      title={
        <HStack gap={2} vAlign="center">
          {project && <Token label={project.key} />}
          <Text weight="bold">{project?.name || "Project"}</Text>
        </HStack>
      }
      actions={actions}>
      <Section variant="transparent" padding={5} maxWidth={1280}>
        <VStack gap={5} hAlign="stretch">
          {project && <ProjectTabs projectId={id} />}

          <HStack gap={4} vAlign="center">
            <Heading level={2}>Lập kế hoạch Sprint</Heading>
            <StackItem size="fill" />
            <Text type="supporting">
              {sprints.length} sprint · {backlog.length} việc trong backlog
            </Text>
          </HStack>

          {error && <Banner status="error" title={error} isDismissable onDismiss={() => setError(null)} />}

          {sprints.length === 0 && !creating && (
            <EmptyState
              title="Chưa có sprint nào"
              description="Mọi công việc đang nằm ở backlog. Tạo sprint đầu tiên rồi kéo việc vào."
              icon={<Icon name="sprint" size={40} />}
              actions={
                <Button
                  label="Tạo sprint đầu tiên"
                  variant="primary"
                  icon={<Icon name="add" size={18} />}
                  onClick={() => setCreating(true)}
                />
              }
            />
          )}

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
                  await api
                    .updateSprint(s.id, { startDate, endDate })
                    .catch((e) => setError(e.message));
                  reload();
                }}>
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
          <VStack gap={3} hAlign="stretch">
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Badge label="Backlog" />
              <Text type="supporting">
                {backlog.length} việc · {points(backlog)} pts
              </Text>
              <StackItem size="fill" />
              {picked.size > 0 && sprints.length > 0 && (
                <HStack gap={2} vAlign="center">
                  <Text type="supporting">Đã chọn {picked.size}</Text>
                  <Selector
                    label="Chuyển vào sprint"
                    isLabelHidden
                    size="sm"
                    value=""
                    onChange={(v) => {
                      if (v) moveSelected(v);
                    }}
                    placeholder="Chuyển vào sprint…"
                    options={sprints
                      .filter((s) => s.state !== "completed")
                      .map((s) => ({ value: s.id, label: s.name }))}
                  />
                  <Button
                    label="Bỏ chọn"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPicked(new Set())}
                  />
                </HStack>
              )}
            </HStack>
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
          </VStack>
        </VStack>
      </Section>

      {creating && (
        <NewSprintDialog
          projectId={id}
          suggestedName={`Sprint ${sprints.length + 1}`}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            reload();
          }}
        />
      )}
      {openTask && (
        <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={reload} />
      )}
    </AppShell>
  );
}

/** Creation form. Defaults to a two-week sprint starting today. */
function NewSprintDialog({
  projectId,
  suggestedName,
  onClose,
  onCreated,
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

  async function submit() {
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

  const close = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <Dialog isOpen onOpenChange={close} purpose="form" width={480}>
      <DialogHeader title="Sprint mới" onOpenChange={close} />
      <VStack gap={0} hAlign="stretch">
        <Section variant="transparent" padding={4}>
          <FormLayout>
            <TextInput
              label="Tên sprint"
              value={name}
              onChange={setName}
              hasAutoFocus
              status={error ? { type: "error", message: error } : undefined}
            />
            <TextArea
              label="Mục tiêu"
              rows={2}
              placeholder="Hoàn thiện luồng đăng nhập"
              value={goal}
              onChange={setGoal}
              isOptional
            />
            <Grid columns={2} gap={4}>
              <DateInput
                label="Bắt đầu"
                value={asDate(startDate)}
                onChange={(v) => setStartDate(v ?? "")}
              />
              <DateInput
                label="Kết thúc"
                value={asDate(endDate)}
                min={asDate(startDate)}
                onChange={(v) => setEndDate(v ?? "")}
              />
            </Grid>
          </FormLayout>
        </Section>
        <Section variant="transparent" padding={4} dividers={["top"]}>
          <HStack gap={2} justify="end">
            <Button label="Huỷ" variant="ghost" onClick={onClose} />
            <Button
              label={busy ? "Đang tạo…" : "Tạo sprint"}
              variant="primary"
              isLoading={busy}
              isDisabled={busy || !name.trim()}
              clickAction={submit}
            />
          </HStack>
        </Section>
      </VStack>
    </Dialog>
  );
}

function SprintSection({
  sprint,
  count,
  pts,
  onState,
  onRename,
  onDates,
  children,
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
    <Card padding={4}>
      <VStack gap={3} hAlign="stretch">
        <HStack gap={2} vAlign="center" wrap="wrap">
          <Badge
            variant={STATE_VARIANT[sprint.state] ?? "neutral"}
            label={STATE_LABEL[sprint.state] ?? sprint.state}
          />
          <Text type="large" weight="semibold" maxLines={1}>
            {sprint.name}
          </Text>
          <Text type="supporting">
            {count} việc · {pts} pts · {dateRange}
          </Text>
          <StackItem size="fill" />
          {sprint.state === "planned" && (
            <Button
              label="Bắt đầu"
              variant="ghost"
              size="sm"
              icon={<Icon name="play_arrow" size={18} />}
              onClick={() => onState("active")}
            />
          )}
          {sprint.state === "active" && (
            <Button
              label="Kết thúc"
              variant="ghost"
              size="sm"
              icon={<Icon name="flag" size={18} />}
              onClick={() => onState("completed")}
            />
          )}
          <IconButton
            label="Sửa sprint"
            tooltip="Sửa"
            variant="ghost"
            size="sm"
            icon={<Icon name="edit" size={20} />}
            onClick={() => setEditing((v) => !v)}
          />
          <IconButton
            label={open ? "Thu gọn" : "Mở rộng"}
            variant="ghost"
            size="sm"
            icon={<Icon name={open ? "expand_less" : "expand_more"} size={22} />}
            onClick={() => setOpen((o) => !o)}
          />
        </HStack>

        {sprint.goal && !editing && <Text type="supporting">🎯 {sprint.goal}</Text>}

        {editing && (
          <VStack gap={3} hAlign="stretch">
            <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={3}>
              <TextInput label="Tên sprint" value={name} onChange={setName} />
              <TextInput label="Mục tiêu" value={goal} onChange={setGoal} isOptional />
              <DateInput label="Bắt đầu" value={asDate(start)} onChange={(v) => setStart(v ?? "")} />
              <DateInput
                label="Kết thúc"
                value={asDate(end)}
                min={asDate(start)}
                onChange={(v) => setEnd(v ?? "")}
              />
            </Grid>
            <HStack gap={2} justify="end">
              <Button label="Huỷ" variant="ghost" onClick={() => setEditing(false)} />
              <Button
                label="Lưu"
                variant="primary"
                onClick={() => {
                  onRename(name.trim(), goal.trim());
                  if (
                    start !== (sprint.startDate?.slice(0, 10) ?? "") ||
                    end !== (sprint.endDate?.slice(0, 10) ?? "")
                  ) {
                    onDates(start, end);
                  }
                  setEditing(false);
                }}
              />
            </HStack>
          </VStack>
        )}

        {open && children}
      </VStack>
    </Card>
  );
}

function fmt(d?: string) {
  return d ? new Date(d).toLocaleDateString() : "—";
}

function TaskRows({
  items,
  sprints,
  onOpen,
  onMove,
  onPoints,
  backlog,
  picked,
  onPick,
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
      <EmptyState
        title={
          backlog
            ? "Backlog trống"
            : "Chưa có việc trong sprint này — chọn việc ở backlog rồi chuyển vào."
        }
        isCompact
      />
    );
  }
  const openSprints = sprints.filter((s) => s.state !== "completed");
  // Dense, scannable records → rows edge-to-edge, không bọc Card từng việc.
  return (
    <List hasDividers>
      {items.map((t) => (
        <ListItem
          key={t.id}
          startContent={
            backlog && onPick ? (
              <CheckboxInput
                label={`Chọn ${t.title}`}
                isLabelHidden
                value={picked?.has(t.id) ?? false}
                onChange={() => onPick(t.id)}
              />
            ) : (
              <Icon name="drag_indicator" size={18} />
            )
          }
          label={t.title}
          onClick={() => onOpen(t.id)}
          endContent={
            <HStack gap={3} vAlign="center">
              <Badge label={PRIORITIES[t.priority]?.label ?? t.priority} />
              <NumberInput
                label="Story points"
                isLabelHidden
                size="sm"
                width={88}
                min={0}
                value={t.storyPoints ?? 0}
                onChange={(v) => {
                  if (v !== (t.storyPoints ?? 0)) onPoints(t, v ?? 0);
                }}
              />
              <Selector
                label="Sprint"
                isLabelHidden
                size="sm"
                value={t.sprintId ?? ""}
                onChange={(v) => onMove(t, v || null)}
                isDisabled={openSprints.length === 0 && !t.sprintId}
                disabledMessage={openSprints.length === 0 ? "Tạo sprint trước" : undefined}
                options={[
                  { value: "", label: "Backlog" },
                  ...sprints.map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
            </HStack>
          }
        />
      ))}
    </List>
  );
}
