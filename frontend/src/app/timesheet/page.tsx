"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Section } from "@astryxdesign/core/Section";
import { Card } from "@astryxdesign/core/Card";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import {
  Table,
  TableHeader,
  TableHeaderCell,
  TableBody,
  TableFooter,
  TableRow,
  TableCell,
} from "@astryxdesign/core/Table";
import { List, ListItem } from "@astryxdesign/core/List";
import { Selector } from "@astryxdesign/core/Selector";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Badge } from "@astryxdesign/core/Badge";
import { Divider } from "@astryxdesign/core/Divider";
import { Token } from "@astryxdesign/core/Token";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { api, TimesheetEntry, Project } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";

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

interface MonthRow {
  user: string;
  project: string;
  task: string;
  total: number;
}

export default function TimesheetPage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState<TimesheetEntry[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const from = fmt(weekStart);
  const to = fmt(addDays(weekStart, 6));

  useEffect(() => {
    api
      .listWorkspaces()
      .then((wss) => {
        if (wss.length > 0) {
          api.listProjects(wss[0].id).then((ps) =>
            setProjects(ps.filter((p) => p.role === "owner")),
          );
        }
      })
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!selectedProject) {
      api.myTimesheet(from, to).then((r) => setEntries(r.entries)).catch(() => setEntries([]));
    } else {
      api
        .projectTimesheet(selectedProject, from, to)
        .then((r) => setEntries(r.entries))
        .catch(() => setEntries([]));
    }
  }, [from, to, selectedProject]);

  useEffect(() => {
    load();
  }, [load]);

  // Gộp theo task (và user nếu xem team)
  const rows = useMemo(() => {
    const map = new Map<
      string,
      { title: string; projectKey: string; user: string; days: number[]; total: number }
    >();
    for (const e of entries) {
      const key = selectedProject ? e.userId + "|" + e.taskId : e.taskId;
      if (!map.has(key))
        map.set(key, {
          title: e.taskTitle,
          projectKey: e.projectKey,
          user: e.userDisplayName || e.userEmail || "Unknown",
          days: [0, 0, 0, 0, 0, 0, 0],
          total: 0,
        });
      const row = map.get(key)!;
      const di = (new Date(e.loggedOn).getDay() + 6) % 7;
      const h = e.minutes / 60;
      row.days[di] += h;
      row.total += h;
    }
    return Array.from(map.values());
  }, [entries, selectedProject]);

  const dayTotals = useMemo(() => {
    const t = [0, 0, 0, 0, 0, 0, 0];
    rows.forEach((r) => r.days.forEach((h, i) => (t[i] += h)));
    return t;
  }, [rows]);
  const grand = dayTotals.reduce((a, b) => a + b, 0);
  const anyDraft = entries.some((e) => e.state === "draft");

  /** Entries awaiting a decision — only meaningful in the team (project) view. */
  const pending = useMemo(() => entries.filter((e) => e.state === "submitted"), [entries]);

  async function submit() {
    setSubmitting(true);
    await api.submitTimesheet(from, to).catch(() => {});
    await load();
    setSubmitting(false);
  }

  async function review(worklogId: string, state: "approved" | "rejected") {
    setReviewing(true);
    await api.setWorklogState(worklogId, state).catch(() => {});
    await load();
    setReviewing(false);
  }

  function exportWeek() {
    const lines = [];
    if (selectedProject) lines.push("Thành viên,Dự án,Công việc,T2,T3,T4,T5,T6,T7,CN,Tổng (giờ)");
    else lines.push("Dự án,Công việc,T2,T3,T4,T5,T6,T7,CN,Tổng (giờ)");
    rows.forEach((r) => {
      const d = r.days.map((x) => (x > 0 ? x.toFixed(2) : "")).join(",");
      if (selectedProject)
        lines.push(`"${r.user}","${r.projectKey}","${r.title}",${d},${r.total.toFixed(2)}`);
      else lines.push(`"${r.projectKey}","${r.title}",${d},${r.total.toFixed(2)}`);
    });
    downloadCSV(lines, `timesheet_${from}_${to}.csv`);
  }

  async function exportMonth() {
    const mStart = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
    const mEnd = new Date(weekStart.getFullYear(), weekStart.getMonth() + 1, 0);
    const f = fmt(mStart);
    const t = fmt(mEnd);
    const r = selectedProject
      ? await api.projectTimesheet(selectedProject, f, t)
      : await api.myTimesheet(f, t);

    const map = new Map<string, MonthRow>();
    for (const e of r.entries) {
      const key = selectedProject ? e.userId + "|" + e.taskId : e.taskId;
      if (!map.has(key))
        map.set(key, {
          user: e.userDisplayName || e.userEmail || "Unknown",
          project: e.projectKey,
          task: e.taskTitle,
          total: 0,
        });
      map.get(key)!.total += e.minutes / 60;
    }

    const lines = [];
    if (selectedProject) lines.push("Thành viên,Dự án,Công việc,Tổng (giờ)");
    else lines.push("Dự án,Công việc,Tổng (giờ)");
    for (const row of Array.from(map.values())) {
      if (selectedProject)
        lines.push(`"${row.user}","${row.project}","${row.task}",${row.total.toFixed(2)}`);
      else lines.push(`"${row.project}","${row.task}",${row.total.toFixed(2)}`);
    }
    downloadCSV(lines, `timesheet_thang_${f.slice(0, 7)}.csv`);
  }

  function downloadCSV(lines: string[], filename: string) {
    const csv = "﻿" + lines.join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    link.download = filename;
    link.click();
  }

  const actions = (
    <HStack gap={2} vAlign="center">
      <Button
        label="Xuất Tuần"
        variant="secondary"
        size="sm"
        icon={<Icon name="download" size={18} />}
        onClick={exportWeek}
      />
      <Button
        label="Xuất Tháng"
        variant="secondary"
        size="sm"
        icon={<Icon name="download" size={18} />}
        clickAction={exportMonth}
      />
      {!selectedProject && (
        <Button
          label="Trình duyệt"
          variant="primary"
          size="sm"
          icon={<Icon name="send" size={18} />}
          isDisabled={!anyDraft || submitting}
          isLoading={submitting}
          clickAction={submit}
        />
      )}
    </HStack>
  );

  return (
    <AppShell title="Timesheet" actions={actions}>
      <Section variant="transparent" padding={5} maxWidth={1152}>
        <VStack gap={5} hAlign="stretch">
          <HStack gap={4} vAlign="center" wrap="wrap">
            <Heading level={2}>Bảng chấm công</Heading>
            <StackItem size="fill" />
            <Selector
              label="Phạm vi"
              isLabelHidden
              size="sm"
              value={selectedProject}
              onChange={(v) => setSelectedProject(v ?? "")}
              options={[
                { value: "", label: "Cá nhân (My Timesheet)" },
                ...projects.map((p) => ({ value: p.id, label: `[Team] ${p.name}` })),
              ]}
            />
            <Divider orientation="vertical" />
            <IconButton
              label="Tuần trước"
              variant="ghost"
              size="sm"
              icon={<Icon name="chevron_left" size={18} />}
              onClick={() => setWeekStart((d) => addDays(d, -7))}
            />
            <Text type="supporting">
              {weekStart.toLocaleDateString()} – {addDays(weekStart, 6).toLocaleDateString()}
            </Text>
            <IconButton
              label="Tuần sau"
              variant="ghost"
              size="sm"
              icon={<Icon name="chevron_right" size={18} />}
              onClick={() => setWeekStart((d) => addDays(d, 7))}
            />
            <Button
              label="Tuần này"
              variant="ghost"
              size="sm"
              onClick={() => setWeekStart(startOfWeek(new Date()))}
            />
          </HStack>

          {/* Bảng cột động (7 ngày) + dòng tổng → Table ở chế độ children. */}
          <Card padding={0}>
            {rows.length === 0 ? (
              <EmptyState title="Không có bản ghi worklog nào trong tuần này." />
            ) : (
              <Table density="compact" hasHover>
                <TableHeader>
                  <TableRow>
                    {selectedProject && <TableHeaderCell>Thành viên</TableHeaderCell>}
                    <TableHeaderCell>Công việc</TableHeaderCell>
                    {weekDays.map((d, i) => (
                      <TableHeaderCell key={i}>
                        {DAYS[i]} {d.getDate()}
                      </TableHeaderCell>
                    ))}
                    <TableHeaderCell>Tổng</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r, ri) => (
                    <TableRow key={ri}>
                      {selectedProject && (
                        <TableCell>
                          <Text weight="medium">{r.user}</Text>
                        </TableCell>
                      )}
                      <TableCell>
                        <HStack gap={2} vAlign="center">
                          <Token label={r.projectKey} />
                          <Text maxLines={1}>{r.title}</Text>
                        </HStack>
                      </TableCell>
                      {r.days.map((h, i) => (
                        <TableCell key={i}>
                          <Text type="supporting" hasTabularNumbers justify="center">
                            {h > 0 ? h.toFixed(2) : "·"}
                          </Text>
                        </TableCell>
                      ))}
                      <TableCell>
                        <Text weight="semibold" hasTabularNumbers justify="end">
                          {r.total.toFixed(2)}
                        </Text>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell>
                      <Text weight="semibold" justify="end">Tổng ngày</Text>
                    </TableCell>
                    {selectedProject && <TableCell />}
                    {dayTotals.map((h, i) => (
                      <TableCell key={i}>
                        <Text
                          weight="semibold"
                          hasTabularNumbers
                          justify="center"
                          color={h > 8 ? "accent" : "primary"}>
                          {h > 0 ? h.toFixed(1) : "·"}
                        </Text>
                      </TableCell>
                    ))}
                    <TableCell>
                      <Text weight="semibold" color="accent" hasTabularNumbers justify="end">
                        {grand.toFixed(1)}h
                      </Text>
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            )}
          </Card>

          <Text type="supporting">
            Ô ngày quá 8h được tô đỏ. “Trình duyệt” chuyển các bản ghi nháp sang chờ duyệt.
          </Text>

          {/* Approval queue. The submit half of this workflow already existed, but
              there was no screen for the manager to act on what was submitted. */}
          {selectedProject && (
            <VStack gap={4} hAlign="stretch">
              <HStack gap={2} vAlign="center">
                <Heading level={3}>Chờ duyệt</Heading>
                {pending.length > 0 && <Badge variant="warning" label={pending.length} />}
              </HStack>
              {pending.length === 0 ? (
                <EmptyState title="Không có bản ghi nào chờ duyệt trong tuần này." isCompact />
              ) : (
                <VStack gap={3} hAlign="stretch">
                  <List hasDividers>
                    {pending.map((e) => (
                      <ListItem
                        key={e.id}
                        label={`${e.userDisplayName || e.userEmail} · ${e.taskTitle}`}
                        description={`${new Date(e.loggedOn).toLocaleDateString()} · ${(e.minutes / 60).toFixed(2)}h${e.note ? ` · ${e.note}` : ""}`}
                        endContent={
                          <HStack gap={1} vAlign="center">
                            <Button
                              label="Duyệt"
                              variant="ghost"
                              size="sm"
                              icon={<Icon name="check" size={18} />}
                              clickAction={() => review(e.id, "approved")}
                            />
                            <Button
                              label="Từ chối"
                              variant="ghost"
                              size="sm"
                              icon={<Icon name="close" size={18} />}
                              clickAction={() => review(e.id, "rejected")}
                            />
                          </HStack>
                        }
                      />
                    ))}
                  </List>
                  <HStack justify="end">
                    <Button
                      label={`Duyệt tất cả (${pending.length})`}
                      variant="primary"
                      icon={<Icon name="done_all" size={18} />}
                      isDisabled={reviewing}
                      isLoading={reviewing}
                      clickAction={async () => {
                        setReviewing(true);
                        await Promise.all(
                          pending.map((e) => api.setWorklogState(e.id, "approved")),
                        ).catch(() => {});
                        await load();
                        setReviewing(false);
                      }}
                    />
                  </HStack>
                </VStack>
              )}
            </VStack>
          )}
        </VStack>
      </Section>
    </AppShell>
  );
}
