"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { Section } from "@astryxdesign/core/Section";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { DateInput } from "@astryxdesign/core/DateInput";
import { TimeInput } from "@astryxdesign/core/TimeInput";
import { createISOTimeString } from "@astryxdesign/core/utils";
import { Selector } from "@astryxdesign/core/Selector";
import { MultiSelector } from "@astryxdesign/core/MultiSelector";
import { Button } from "@astryxdesign/core/Button";
import { Avatar } from "@astryxdesign/core/Avatar";
import { AvatarGroup } from "@astryxdesign/core/AvatarGroup";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { api, CalendarItem, Member, Project, Workspace } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import TaskDrawer from "@/components/task/TaskDrawer";
import {
  START_HOUR, hours, fmtHour, fmtTime, startOfWeek, addDays, sameDay, ymd,
} from "@/lib/calendar";

/** Kiểu ngày/giờ Astryx yêu cầu ở mức template literal. */
type DateValue = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;
const asDate = (s: string) => (s || undefined) as DateValue | undefined;
const asTime = (s: string) => (s ? createISOTimeString(s) ?? undefined : undefined);

type View = "day" | "week" | "month" | "year";
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Chiều cao một giờ trong lưới, tính bằng px. */
const HOUR_H = 80;

/**
 * NGOẠI LỆ CÓ CHỦ ĐÍCH: lưới lịch bên dưới dùng `style` cho toạ độ.
 * `top`/`height` của mỗi sự kiện suy ra từ giờ bắt đầu/kết thúc
 * (`(phút / 60) * HOUR_H`), là dữ liệu lúc chạy chứ không phải giá trị thiết
 * kế — không token nào diễn đạt được, và Astryx không có component lịch.
 * Màu sắc, chữ, khoảng cách ở phần còn lại vẫn đi qua token/component.
 */
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
      const d = new Date(cursor);
      d.setHours(0, 0, 0, 0);
      return { from: d, to: addDays(d, 1), days: 1 };
    }
    const ws = startOfWeek(cursor);
    return { from: ws, to: addDays(ws, 7), days: 7 };
  }, [view, cursor]);

  const load = useCallback(() => {
    api.myCalendar(ymd(range.from), ymd(range.to)).then(setTasks).catch(() => setTasks([]));
  }, [range.from, range.to]);
  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(
    () => Array.from({ length: range.days }, (_, i) => addDays(range.from, i)),
    [range.from, range.days],
  );
  const today = new Date();

  const title = `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`;

  return (
    <AppShell title={null}>
      <Section variant="transparent" padding={8} maxWidth={1400}>
        <VStack gap={6} hAlign="stretch">
          <HStack gap={4} vAlign="center" wrap="wrap">
            <Heading level={2}>{title}</Heading>
            <StackItem size="fill" />
            <SegmentedControl
              label="Chế độ xem"
              size="sm"
              value={view}
              onChange={(v) => setView(v as View)}>
              <SegmentedControlItem value="day" label="Day" />
              <SegmentedControlItem value="week" label="Week" />
              <SegmentedControlItem value="month" label="Month" />
              <SegmentedControlItem value="year" label="Year" />
            </SegmentedControl>
            <Button label="Today" variant="secondary" size="sm" onClick={() => setCursor(new Date())} />
            <Button
              label="Add Event"
              variant="primary"
              size="sm"
              onClick={() => {
                const d = new Date();
                d.setMinutes(0, 0, 0);
                setNewAt(d);
              }}
            />
          </HStack>

          {view === "month" || view === "year" ? (
            <MonthGrid days={days} cursor={cursor} today={today} />
          ) : (
            <TimeGrid
              days={days}
              tasks={tasks}
              onOpen={setOpenTask}
              onSlot={(d) => setNewAt(d)}
              today={today}
            />
          )}
        </VStack>
      </Section>

      {openTask && (
        <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={load} />
      )}
      {newAt && (
        <NewEventModal
          at={newAt}
          onClose={() => setNewAt(null)}
          onCreated={() => {
            setNewAt(null);
            load();
          }}
        />
      )}
    </AppShell>
  );
}

function TimeGrid({
  days,
  tasks,
  onOpen,
  onSlot,
  today,
}: {
  days: Date[];
  tasks: CalendarItem[];
  onOpen: (id: string) => void;
  onSlot: (d: Date) => void;
  today: Date;
}) {
  const timed = (d: Date) => tasks.filter((t) => t.startAt && sameDay(new Date(t.startAt), d));

  const scroller: CSSProperties = { height: "calc(100vh - 220px)", overflowY: "auto" };
  const headRow: CSSProperties = {
    display: "flex",
    position: "sticky",
    top: 0,
    zIndex: 30,
    background: "var(--color-background-surface)",
    borderBottom: "1px solid var(--color-border)",
  };
  const gutter: CSSProperties = {
    width: 64,
    flexShrink: 0,
    borderInlineEnd: "1px solid var(--color-border)",
  };

  return (
    <Card padding={0}>
      <div style={scroller}>
        <div style={headRow}>
          <div style={gutter} />
          {days.map((d, i) => {
            const isToday = sameDay(d, today);
            return (
              <div
                key={i}
                style={{
                  flex: 1,
                  textAlign: "center",
                  padding: "var(--spacing-4) 0",
                  borderInlineEnd: "1px solid var(--color-border)",
                }}>
                <HStack gap={1.5} vAlign="center" justify="center">
                  <Text weight="semibold" color={isToday ? "accent" : "secondary"}>
                    {WEEKDAYS[(d.getDay() + 6) % 7]}
                  </Text>
                  <Text weight="semibold" color={isToday ? "accent" : "primary"}>
                    {d.getDate()}
                  </Text>
                </HStack>
              </div>
            );
          })}
        </div>

        <div style={{ display: "flex" }}>
          <div style={{ ...gutter, background: "var(--color-background-surface)" }}>
            {hours().map((h) => (
              <div
                key={h}
                style={{
                  height: HOUR_H,
                  display: "grid",
                  placeItems: "center",
                  borderBottom: "1px solid var(--color-border)",
                }}>
                <Text type="supporting">{fmtHour(h)}</Text>
              </div>
            ))}
          </div>

          {days.map((d, di) => (
            <div
              key={di}
              style={{
                flex: 1,
                position: "relative",
                borderInlineEnd: "1px solid var(--color-border)",
              }}>
              {hours().map((h) => (
                <div
                  key={h}
                  onClick={() => {
                    const dd = new Date(d);
                    dd.setHours(h, 0, 0, 0);
                    onSlot(dd);
                  }}
                  style={{
                    height: HOUR_H,
                    cursor: "pointer",
                    borderBottom: "1px solid var(--color-border)",
                  }}
                />
              ))}

              {sameDay(d, today) && <NowLine />}

              {timed(d).map((t) => {
                const startDt = new Date(t.startAt!);
                const endDt = t.endAt
                  ? new Date(t.endAt)
                  : new Date(startDt.getTime() + 3600000 * 2); // default 2 hrs for display

                const startMin = (startDt.getHours() - START_HOUR) * 60 + startDt.getMinutes();
                const top = (startMin / 60) * HOUR_H;
                const durationMins = (endDt.getTime() - startDt.getTime()) / 60000;
                const height = (durationMins / 60) * HOUR_H;

                // Màu phân loại lấy từ token của theme (đổi theo dark mode),
                // chọn ổn định theo id để cùng một việc luôn cùng màu.
                const TINTS = ["blue", "green", "orange", "pink", "purple"] as const;
                const tint = TINTS[(t.id.charCodeAt(0) + t.id.charCodeAt(1)) % TINTS.length];

                return (
                  <button
                    key={t.id}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onOpen(t.id);
                    }}
                    style={{
                      position: "absolute",
                      insetInline: 6,
                      top: Math.max(0, top),
                      height: Math.max(40, height),
                      overflow: "hidden",
                      textAlign: "start",
                      padding: "var(--spacing-3)",
                      borderRadius: "var(--radius-lg, 12px)",
                      background: `var(--color-background-${tint})`,
                      color: `var(--color-text-${tint})`,
                      border: "1px solid var(--color-border)",
                    }}>
                    <VStack gap={2} hAlign="stretch" height="100%">
                      <Text weight="bold" type="supporting" color="inherit" maxLines={2}>
                        {t.title}
                      </Text>
                      {height > 60 && (
                        <>
                          <StackItem size="fill" />
                          <HStack gap={1.5} vAlign="center">
                            <Text type="supporting" color="inherit">
                              {fmtTime(startDt)} – {fmtTime(endDt)}
                            </Text>
                          </HStack>
                        </>
                      )}
                      {height >= 80 && t.assigneeId && (
                        <AvatarGroup size="xsm">
                          <Avatar
                            name={t.assigneeName || "User"}
                            src={t.assigneeAvatar || undefined}
                            size="xsm"
                          />
                          {(t.participantIds ?? []).map((pid) => (
                            <Avatar key={pid} name="P" size="xsm" />
                          ))}
                        </AvatarGroup>
                      )}
                    </VStack>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

function NowLine() {
  const now = new Date();
  if (now.getHours() < START_HOUR) return null;
  const min = (now.getHours() - START_HOUR) * 60 + now.getMinutes();
  const top = (min / 60) * HOUR_H;
  return (
    <div
      style={{
        position: "absolute",
        insetInline: 0,
        top,
        zIndex: 20,
        pointerEvents: "none",
        height: 2,
        background: "var(--color-error)",
      }}>
      <span
        style={{
          position: "absolute",
          insetInlineStart: -4,
          top: -4,
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: "var(--color-error)",
        }}
      />
    </div>
  );
}

function MonthGrid({ days, cursor, today }: { days: Date[]; cursor: Date; today: Date }) {
  return (
    <Card padding={0}>
      <Grid columns={7} gap={0}>
        {WEEKDAYS.map((d) => (
          <div
            key={d}
            style={{
              padding: "var(--spacing-4) 0",
              textAlign: "center",
              borderBottom: "1px solid var(--color-border)",
            }}>
            <Text weight="semibold" color="secondary">
              {d}
            </Text>
          </div>
        ))}
        {days.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = sameDay(d, today);
          return (
            <div
              key={i}
              style={{
                minHeight: 120,
                padding: "var(--spacing-2)",
                borderBottom: "1px solid var(--color-border)",
                borderInlineEnd: "1px solid var(--color-border)",
                background: inMonth ? undefined : "var(--color-background-muted)",
              }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  marginInline: "auto",
                  display: "grid",
                  placeItems: "center",
                  borderRadius: "50%",
                  background: isToday ? "var(--color-accent)" : undefined,
                }}>
                <Text
                  weight="semibold"
                  type="supporting"
                  color={isToday ? "inherit" : inMonth ? "primary" : "disabled"}>
                  {d.getDate()}
                </Text>
              </div>
            </div>
          );
        })}
      </Grid>
    </Card>
  );
}

function NewEventModal({
  at,
  onClose,
  onCreated,
}: {
  at: Date;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [projects, setProjects] = useState<(Project & { wsName: string })[]>([]);
  const [projectId, setProjectId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [assigneeId, setAssigneeId] = useState("");
  const [participantIds, setParticipantIds] = useState<string[]>([]);
  const [titleV, setTitleV] = useState("");
  const [place, setPlace] = useState("");
  const [notes, setNotes] = useState("");
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
    api.projectMembers(projectId).then(setMembers).catch(() => setMembers([]));
  }, [projectId]);

  async function create() {
    if (!projectId || !titleV.trim()) return;
    setBusy(true);
    try {
      const t = await api.createTask(projectId, {
        title: titleV.trim(),
        assigneeId: assigneeId || undefined,
        participantIds,
      });
      await api.updateTask(t.id, {
        startAt: new Date(`${date}T${start}`).toISOString(),
        endAt: new Date(`${date}T${end}`).toISOString(),
      });
      onCreated();
    } catch {
      setBusy(false);
    }
  }

  const close = (open: boolean) => {
    if (!open) onClose();
  };

  return (
    <Dialog isOpen onOpenChange={close} purpose="form" width={420}>
      <DialogHeader title="New Event" onOpenChange={close} />
      <VStack gap={0} hAlign="stretch">
        <Section variant="transparent" padding={4}>
          <FormLayout>
            <TextInput
              label="Event Title"
              placeholder="Event Title"
              value={titleV}
              onChange={setTitleV}
              hasAutoFocus
            />
            <Selector
              label="Dự án"
              value={projectId}
              onChange={(v) => setProjectId(v ?? "")}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
            <TextInput label="Địa điểm" isOptional placeholder="Add Place" value={place} onChange={setPlace} />
            <DateInput label="Ngày" value={asDate(date)} onChange={(v) => setDate(v ?? "")} />
            <Grid columns={2} gap={3}>
              <TimeInput label="Bắt đầu" value={asTime(start)} onChange={(v) => setStart(v ?? "")} />
              <TimeInput label="Kết thúc" value={asTime(end)} onChange={(v) => setEnd(v ?? "")} />
            </Grid>
            <Selector
              label="Người phụ trách"
              value={assigneeId}
              onChange={(v) => setAssigneeId(v ?? "")}
              placeholder="Chưa gán"
              hasClear
              options={members.map((m) => ({
                value: m.userId,
                label: m.displayName || m.email,
              }))}
            />
            {/* MultiSelector thay cho dropdown checkbox tự chế: nó lo sẵn bàn
                phím, ARIA và click-outside. */}
            <MultiSelector
              label="Người cùng tham gia"
              value={participantIds}
              onChange={setParticipantIds}
              placeholder="Người cùng tham gia"
              options={members.map((m) => ({
                value: m.userId,
                label: m.displayName || m.email,
              }))}
            />
            <TextArea label="Ghi chú" isOptional placeholder="Add Notes" rows={4} value={notes} onChange={setNotes} />
          </FormLayout>
        </Section>
        <Section variant="transparent" padding={4} dividers={["top"]}>
          <Button
            label="Add Event"
            variant="primary"
            width="100%"
            isLoading={busy}
            isDisabled={busy || !projectId || !titleV.trim()}
            clickAction={create}
          />
        </Section>
      </VStack>
    </Dialog>
  );
}
