"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Section } from "@astryxdesign/core/Section";
import { Card } from "@astryxdesign/core/Card";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Badge } from "@astryxdesign/core/Badge";
import { Token } from "@astryxdesign/core/Token";
import { Divider } from "@astryxdesign/core/Divider";
import { Avatar } from "@astryxdesign/core/Avatar";
import { AvatarGroup } from "@astryxdesign/core/AvatarGroup";
import { Kbd } from "@astryxdesign/core/Kbd";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { EmptyState } from "@astryxdesign/core/EmptyState";
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

type PriorityVariant = "error" | "warning" | "info" | "neutral";
const PRIORITY_VARIANT: Record<string, PriorityVariant> = {
  urgent: "error",
  high: "warning",
  medium: "info",
  low: "neutral",
};

const shortDate = (s: string) =>
  new Date(s).toLocaleDateString("vi-VN", { month: "short", day: "numeric" });

/** Chip trạng thái: màu do người dùng đặt cho cột, nên tính lúc chạy. */
function StatusChip({ s }: { s: StatusDef }) {
  const style: CSSProperties = {
    ...s.style,
    paddingInline: "var(--spacing-3)",
    paddingBlock: "var(--spacing-1)",
    borderRadius: "999px",
    fontSize: "0.75rem",
    fontWeight: 700,
    whiteSpace: "nowrap",
  };
  return <span style={style}>{s.label}</span>;
}

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
    api
      .projectMembers(id)
      .then((ms: Member[]) => {
        const map: Members = {};
        ms.forEach(
          (m) => (map[m.userId] = { name: m.displayName || m.email, avatarUrl: m.avatarUrl || "" }),
        );
        setMembers(map);
        setMemberList(ms);
      })
      .catch(() => {});
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
    } catch (err) {
      // Surface WIP-limit rejections instead of silently doing nothing.
      window.alert((err as Error)?.message || "Không thể chuyển trạng thái");
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
      window.alert((e as Error).message);
    }
  }

  /** Restores a saved view's filter/sort/mode. */
  function applyView(v: SavedView) {
    const cfg = v.config as { view?: View; sort?: SortKey; filters?: FilterState };
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
    <AppShell
      title={
        // Header matches the other project pages so the project you're in is
        // always named the same way, instead of saying "Dashboard".
        <HStack gap={2} vAlign="center">
          {project && <Token label={project.key} />}
          <Text weight="bold">{project?.name || "Dự án"}</Text>
        </HStack>
      }>
      <Section variant="transparent" padding={8} maxWidth={1400}>
        <VStack gap={6} hAlign="stretch">
          {/* The board is the project's landing page, but it was the only project
              page without the tab bar — so Sprints/Timeline/Reports were
              unreachable once you clicked into a project. */}
          <ProjectTabs projectId={id} />

          <HStack gap={3} vAlign="center" wrap="wrap">
            <Icon name="folder_open" size={20} />
            <Heading level={2}>{project?.name || "Dự án"}</Heading>
            <StackItem size="fill" />

            {views.length > 0 && (
              <Selector
                label="Views đã lưu"
                isLabelHidden
                size="sm"
                value=""
                placeholder="Views đã lưu…"
                onChange={(vid) => {
                  const v = views.find((x) => x.id === vid);
                  if (v) applyView(v);
                }}
                options={views.map((v) => ({
                  value: v.id,
                  label: `${v.shared ? "👥 " : ""}${v.name}`,
                }))}
              />
            )}
            <Button
              label="Lưu view"
              variant="secondary"
              size="sm"
              icon={<Icon name="bookmark_add" size={16} />}
              clickAction={saveCurrentView}
            />

            <SegmentedControl
              label="Kiểu hiển thị"
              size="sm"
              value={view}
              onChange={(v) => setView(v as View)}>
              <SegmentedControlItem value="list" label="List" />
              <SegmentedControlItem value="board" label="Board" />
            </SegmentedControl>

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

            <TextInput
              label="Tìm công việc"
              isLabelHidden
              size="sm"
              width={200}
              placeholder="Search Task"
              value={query}
              onChange={setQuery}
            />
            <Kbd keys="mod+k" />

            <Button
              label="Add Task"
              variant="primary"
              size="sm"
              icon={<Icon name="add" size={18} />}
              onClick={() => {
                setView("list");
                setDraft("");
                setAdding(statusDefs[0]?.key ?? "todo");
              }}
            />
          </HStack>

          {view === "list" ? <ListView {...shared} /> : <BoardView {...shared} />}
        </VStack>
      </Section>

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
  if (!wip.limit) return <Badge label={wip.count} />;
  const over = wip.count >= wip.limit;
  return <Badge variant={over ? "error" : "neutral"} label={`${wip.count}/${wip.limit}`} />;
}

/** Avatar người nhận tin + người phụ trách, gộp thành nhóm chồng nhau. */
function TaskPeople({ task, members }: { task: Task; members: Members }) {
  const reporter = task.reporterId ? members[task.reporterId] : undefined;
  const assignee = task.assigneeId ? members[task.assigneeId] : undefined;
  if (!reporter && !assignee) {
    return <Avatar name="?" size={24} tooltip="Chưa phân công" />;
  }
  return (
    <AvatarGroup size="sm">
      {reporter && (
        <Avatar
          name={reporter.name}
          src={reporter.avatarUrl || undefined}
          size={24}
          tooltip={`Nhận thông tin: ${reporter.name}`}
        />
      )}
      {assignee && (
        <Avatar
          name={assignee.name}
          src={assignee.avatarUrl || undefined}
          size={24}
          tooltip={`Phụ trách: ${assignee.name}`}
        />
      )}
    </AvatarGroup>
  );
}

function ListView(props: ViewProps) {
  const { tasks, group, labelForGroup } = props;

  // When grouping by something other than status, render one swimlane per
  // group and reuse the status-column layout inside it.
  if (group !== "status" && group !== "none") {
    const lanes = groupTasks(tasks, group, labelForGroup);
    if (lanes.length === 0) {
      return <EmptyState title="Không có công việc nào khớp bộ lọc." />;
    }
    return (
      <VStack gap={10} hAlign="stretch">
        {lanes.map((lane) => (
          <VStack key={lane.key} gap={4} hAlign="stretch">
            <HStack gap={2} vAlign="center">
              <Heading level={3}>{lane.label}</Heading>
              <Badge label={lane.tasks.length} />
              <StackItem size="fill">
                <Divider />
              </StackItem>
            </HStack>
            <StatusGroups {...props} tasks={lane.tasks} />
          </VStack>
        ))}
      </VStack>
    );
  }

  return <StatusGroups {...props} />;
}

/** Renders tasks grouped by their status column (the default layout). */
function StatusGroups({
  tasks,
  members,
  adding,
  draft,
  setDraft,
  setAdding,
  onAdd,
  onMove,
  onOpen,
  statusDefs,
  wipByKey,
}: ViewProps) {
  return (
    <VStack gap={10} hAlign="stretch">
      {statusDefs.map((s) => {
        const items = tasks.filter((t) => t.status === s.key);
        return (
          <VStack key={s.key} gap={3} hAlign="stretch">
            <HStack gap={2} vAlign="center">
              <StatusChip s={s} />
              <WipBadge wip={wipByKey[s.key]} />
              <StackItem size="fill" />
              <IconButton
                label="Thêm công việc"
                variant="ghost"
                size="sm"
                icon={<Icon name="add" size={20} />}
                onClick={() => setAdding(s.key)}
              />
            </HStack>

            {/* Tasks List — virtualised past ~60 rows so large backlogs stay smooth */}
            <VirtualList
              items={items}
              rowHeight={58}
              gap={12}
              height={620}
              renderRow={(t) => (
                <Card padding={3} height="100%">
                  <HStack gap={3} vAlign="center" height="100%">
                    <Icon name="drag_indicator" size={20} />
                    <CheckboxInput
                      label={`Đánh dấu hoàn thành ${t.title}`}
                      isLabelHidden
                      value={t.status === "done"}
                      onChange={() => onMove(t, t.status === "done" ? "todo" : "done")}
                    />
                    <StackItem size="fill">
                      <Text
                        weight="semibold"
                        maxLines={1}
                        onClick={() => onOpen(t.id)}>
                        {t.title}
                      </Text>
                    </StackItem>

                    {t.priority && (
                      <Badge
                        variant={PRIORITY_VARIANT[t.priority] ?? "neutral"}
                        label={t.priority}
                      />
                    )}

                    {(t.labels ?? []).map((l) => (
                      <Token key={l.id} label={l.name} />
                    ))}

                    <TaskPeople task={t} members={members} />

                    {t.checklistTotal ? (
                      <HStack gap={1} vAlign="center">
                        <Icon name="check_circle" size={16} />
                        <Text type="supporting">
                          {t.checklistDone || 0}/{t.checklistTotal}
                        </Text>
                      </HStack>
                    ) : null}

                    {t.commentCount ? (
                      <HStack gap={1} vAlign="center">
                        <Icon name="chat_bubble_outline" size={16} />
                        <Text type="supporting">{t.commentCount}</Text>
                      </HStack>
                    ) : null}

                    {t.description ? <Icon name="description" size={16} title="Có mô tả" /> : null}

                    {(t.startDate || t.dueDate) && (
                      <HStack gap={1.5} vAlign="center">
                        <Icon name="calendar_today" size={14} />
                        <Text type="supporting">
                          {t.startDate ? shortDate(t.startDate) : ""}
                          {t.startDate && t.dueDate ? " – " : ""}
                          {t.dueDate ? shortDate(t.dueDate) : ""}
                        </Text>
                      </HStack>
                    )}
                  </HStack>
                </Card>
              )}
            />

            {adding === s.key ? (
              <TextInput
                label="Tên công việc"
                isLabelHidden
                hasAutoFocus
                placeholder="Tên công việc, Enter để lưu…"
                value={draft}
                onChange={setDraft}
                onEnter={() => onAdd(s.key)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setAdding(null);
                }}
              />
            ) : (
              <Button
                label="Add Task"
                variant="secondary"
                width="100%"
                onClick={() => {
                  setDraft("");
                  setAdding(s.key);
                }}
              />
            )}
          </VStack>
        );
      })}
    </VStack>
  );
}

/**
 * NGOẠI LỆ CÓ CHỦ ĐÍCH: kéo-thả dùng HTML5 drag & drop gốc, nên các cột và thẻ
 * phải nhận `draggable` / `onDragOver` / `onDrop` trực tiếp. Astryx không có
 * component kanban hay drag-drop. Style còn lại (nền, viền, khoảng cách) vẫn đi
 * qua token/component; chỉ trạng thái "đang kéo qua cột này" là style tính lúc
 * chạy vì nó phụ thuộc con trỏ chuột.
 */
function BoardView({
  tasks,
  members,
  onMove,
  onOpen,
  setAdding,
  statusDefs,
  wipByKey,
}: ViewProps) {
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
    <div style={{ display: "flex", gap: "var(--spacing-5)", overflowX: "auto", paddingBottom: 16 }}>
      {statusDefs.map((s) => {
        const items = tasks.filter((t) => t.status === s.key);
        const wip = wipByKey[s.key];
        const full = !!wip?.limit && wip.count >= wip.limit;
        const isOver = overCol === s.key;
        return (
          <div
            key={s.key}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(s.key);
            }}
            onDragLeave={() => setOverCol((c) => (c === s.key ? null : c))}
            onDrop={() => handleDrop(s.key)}
            style={{
              width: 320,
              flexShrink: 0,
              borderRadius: "var(--radius-lg, 12px)",
              padding: "var(--spacing-2)",
              background: isOver
                ? full
                  ? "var(--color-error-muted)"
                  : "var(--color-accent-muted)"
                : undefined,
            }}>
            <VStack gap={3} hAlign="stretch">
              <HStack gap={2} vAlign="center">
                <StatusChip s={s} />
                <StackItem size="fill" />
                <WipBadge wip={wip ?? { count: items.length }} />
              </HStack>

              {items.map((t) => (
                <div
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
                  style={{
                    cursor: "grab",
                    opacity: dragId === t.id ? 0.4 : 1,
                  }}>
                  <ClickableCard label={t.title} padding={4} onClick={() => onOpen(t.id)}>
                    <VStack gap={3} hAlign="stretch">
                      <HStack gap={2} vAlign="start">
                        <StackItem size="fill">
                          <Text weight="semibold" maxLines={3}>
                            {t.title}
                          </Text>
                        </StackItem>
                        {t.priority && (
                          <Badge
                            variant={PRIORITY_VARIANT[t.priority] ?? "neutral"}
                            label={t.priority}
                          />
                        )}
                      </HStack>
                      <HStack gap={2} vAlign="center">
                        {t.dueDate ? (
                          <HStack gap={1} vAlign="center">
                            <Icon name="calendar_today" size={14} />
                            <Text type="supporting">{shortDate(t.dueDate)}</Text>
                          </HStack>
                        ) : (
                          <Text type="supporting">Không có hạn</Text>
                        )}
                        {t.commentCount ? (
                          <HStack gap={0.5} vAlign="center">
                            <Icon name="chat_bubble_outline" size={14} />
                            <Text type="supporting">{t.commentCount}</Text>
                          </HStack>
                        ) : null}
                        <StackItem size="fill" />
                        <TaskPeople task={t} members={members} />
                      </HStack>
                    </VStack>
                  </ClickableCard>
                </div>
              ))}

              <Button
                label="Add Task"
                variant="secondary"
                width="100%"
                icon={<Icon name="add" size={18} />}
                onClick={() => setAdding(s.key)}
              />
            </VStack>
          </div>
        );
      })}
    </div>
  );
}
