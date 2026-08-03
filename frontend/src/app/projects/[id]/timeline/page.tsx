"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import { Section } from "@astryxdesign/core/Section";
import { Card } from "@astryxdesign/core/Card";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Token } from "@astryxdesign/core/Token";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { api, CriticalPath, Project, Task } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import ProjectTabs from "@/components/layout/ProjectTabs";
import TaskDrawer from "@/components/task/TaskDrawer";
import { statusByKey } from "@/lib/status";

const DAY = 34; // px per day

function dOnly(s?: string) {
  return s ? new Date(s.slice(0, 10)) : null;
}
function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * NGOẠI LỆ CÓ CHỦ ĐÍCH: lưới Gantt bên dưới dùng `style` cho toạ độ.
 * `left`/`width` của mỗi thanh suy ra từ ngày bắt đầu/kết thúc (`offset * DAY`),
 * là dữ liệu lúc chạy chứ không phải giá trị thiết kế — không token nào diễn đạt
 * được, và Astryx không có component Gantt. Màu sắc, chữ, khoảng cách ở phần
 * còn lại vẫn đi qua token/component.
 */
export default function TimelinePage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [cpm, setCpm] = useState<CriticalPath | null>(null);
  const [showCritical, setShowCritical] = useState(true);

  const reload = useCallback(() => {
    api.listTasks(id).then(setTasks).catch(() => {});
    api.criticalPath(id).then(setCpm).catch(() => setCpm(null));
  }, [id]);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    reload();
  }, [id, reload]);

  const scheduled = useMemo(() => tasks.filter((t) => t.startDate || t.dueDate), [tasks]);

  const { spanStart, totalDays, cols } = useMemo(() => {
    if (scheduled.length === 0) return { spanStart: new Date(), totalDays: 0, cols: [] as Date[] };
    let min = Infinity,
      max = -Infinity;
    for (const t of scheduled) {
      const s = dOnly(t.startDate) ?? dOnly(t.dueDate)!;
      const e = dOnly(t.dueDate) ?? dOnly(t.startDate)!;
      min = Math.min(min, s.getTime());
      max = Math.max(max, e.getTime());
    }
    const start = new Date(min);
    start.setDate(start.getDate() - 2);
    const end = new Date(max);
    end.setDate(end.getDate() + 2);
    const total = daysBetween(start, end) + 1;
    const c = Array.from({ length: total }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
    return { spanStart: start, totalDays: total, cols: c };
  }, [scheduled]);

  const today = new Date();

  const canvas: CSSProperties = { minWidth: 240 + totalDays * DAY, overflowX: "auto" };
  const headRow: CSSProperties = {
    display: "flex",
    position: "sticky",
    top: 0,
    background: "var(--color-background-surface)",
    borderBottom: "1px solid var(--color-border)",
  };
  const nameCol: CSSProperties = {
    width: 240,
    flexShrink: 0,
    padding: "var(--spacing-2) var(--spacing-4)",
    borderInlineEnd: "1px solid var(--color-border)",
  };

  return (
    <AppShell
      title={
        <HStack gap={2} vAlign="center">
          {project && <Token label={project.key} />}
          <Text weight="bold">{project?.name || "Project"}</Text>
        </HStack>
      }>
      <Section variant="transparent" padding={5}>
        <VStack gap={5} hAlign="stretch">
          {project && <ProjectTabs projectId={id} />}

          <HStack gap={4} vAlign="center" wrap="wrap">
            <Heading level={2}>Timeline (Gantt)</Heading>
            <StackItem size="fill" />
            {cpm && cpm.items.length > 0 && (
              <HStack gap={4} vAlign="center">
                <Text type="supporting">
                  Đường găng: {cpm.criticalTaskIds.length} việc · dự kiến{" "}
                  {cpm.projectDurationDays} ngày
                </Text>
                <ToggleButton
                  label="Critical Path"
                  size="sm"
                  icon={<StatusDot variant="error" label="Đường găng" />}
                  isPressed={showCritical}
                  onPressedChange={setShowCritical}
                />
              </HStack>
            )}
          </HStack>

          {scheduled.length === 0 ? (
            <EmptyState
              title="Chưa có task nào có ngày bắt đầu/hạn"
              description="Mở một task và đặt ngày để hiển thị trên timeline."
            />
          ) : (
            <Card padding={0}>
              <div style={canvas}>
                {/* Header: days */}
                <div style={headRow}>
                  <div style={nameCol}>
                    <Text type="label" color="secondary">
                      Công việc
                    </Text>
                  </div>
                  <div style={{ display: "flex" }}>
                    {cols.map((d, i) => {
                      const weekend = d.getDay() === 0 || d.getDay() === 6;
                      const isToday = d.toDateString() === today.toDateString();
                      return (
                        <div
                          key={i}
                          style={{
                            width: DAY,
                            textAlign: "center",
                            padding: "var(--spacing-2) 0",
                            borderInlineEnd: "1px solid var(--color-border)",
                            background: weekend ? "var(--color-background-muted)" : undefined,
                          }}>
                          <Text
                            type="supporting"
                            weight={isToday ? "semibold" : undefined}
                            color={isToday ? "accent" : "secondary"}>
                            {d.getDate()}
                          </Text>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Rows */}
                {scheduled.map((t) => {
                  const s = dOnly(t.startDate) ?? dOnly(t.dueDate)!;
                  const e = dOnly(t.dueDate) ?? dOnly(t.startDate)!;
                  const offset = daysBetween(spanStart, s);
                  const len = Math.max(1, daysBetween(s, e) + 1);
                  const st = statusByKey(t.status);
                  const cpItem = cpm?.items.find((i) => i.taskId === t.id);
                  const isCritical = showCritical && !!cpItem?.critical;
                  return (
                    <div
                      key={t.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        borderBottom: "1px solid var(--color-border)",
                      }}>
                      <button
                        style={{
                          ...nameCol,
                          textAlign: "start",
                          display: "flex",
                          alignItems: "center",
                          gap: "var(--spacing-1-5, 6px)",
                        }}
                        onClick={() => setOpenTask(t.id)}>
                        {isCritical && <StatusDot variant="error" label="Trên đường găng" />}
                        <Text type="supporting" maxLines={1}>
                          {t.title}
                        </Text>
                      </button>
                      <div style={{ position: "relative", height: 36, width: totalDays * DAY }}>
                        <button
                          onClick={() => setOpenTask(t.id)}
                          title={
                            cpItem
                              ? `${t.title}\nThời lượng ${cpItem.duration} ngày · slack ${cpItem.slack} ngày${cpItem.critical ? " (đường găng)" : ""}`
                              : t.title
                          }
                          style={{
                            position: "absolute",
                            top: 6,
                            height: 24,
                            left: offset * DAY,
                            width: len * DAY - 4,
                            borderRadius: "var(--radius-md, 6px)",
                            display: "flex",
                            alignItems: "center",
                            paddingInline: "var(--spacing-2)",
                            // Cột tuỳ chỉnh mang hex bất kỳ do người dùng đặt.
                            backgroundColor: isCritical
                              ? "var(--color-error)"
                              : st.hex || "var(--color-accent)",
                            outline: isCritical ? "2px solid var(--color-error-muted)" : undefined,
                          }}>
                          <Text type="supporting" maxLines={1} color="inherit">
                            {t.title}
                          </Text>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </VStack>
      </Section>

      {openTask && (
        <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={reload} />
      )}
    </AppShell>
  );
}
