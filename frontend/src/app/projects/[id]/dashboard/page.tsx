"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Section } from "@astryxdesign/core/Section";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { api, Project, ProjectOverview } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import ProjectTabs from "@/components/layout/ProjectTabs";
import { Donut, BarList } from "@/components/ui/Charts";
import {
  StatTile,
  BarSparkline,
  AreaSparkline,
  RingProgress,
  TrendAreaChart,
} from "@/components/ui/DashboardCharts";
import { PRIORITY_HEX, statusSegments } from "@/lib/status";
import { trendLabel, money, hours } from "@/lib/format";

interface AssigneeRow extends Record<string, unknown> {
  userId: string;
  displayName: string;
  pct: number;
  done: number;
  total: number;
  overdue: number;
  hoursLogged: number;
}

export default function ProjectDashboardPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [ov, setOv] = useState<ProjectOverview | null>(null);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    api.projectOverview(id).then(setOv).catch(() => {});
  }, [id]);

  const trendLabels = useMemo(() => (ov?.trend ?? []).map((t) => trendLabel(t.month)), [ov]);
  const trendRows = useMemo(
    () =>
      (ov?.trend ?? []).map((t) => ({
        created: t.created,
        completed: t.completed,
        inWork: t.inWork,
      })),
    [ov],
  );
  const hoursRows = useMemo(
    () => (ov?.trend ?? []).map((t) => ({ hours: Math.round(t.hours * 10) / 10 })),
    [ov],
  );

  // Labels/colours from the project's own workflow columns, so a status added
  // in Settings charts correctly rather than as an unnamed grey slice.
  const segments = useMemo(() => (ov ? statusSegments(ov.byStatus, ov.statusMeta ?? []) : []), [ov]);
  const prioBars = useMemo(
    () =>
      ov
        ? Object.entries(ov.byPriority).map(([k, v]) => ({
            label: k,
            value: v,
            color: PRIORITY_HEX[k] ?? "var(--color-accent)",
          }))
        : [],
    [ov],
  );

  const donePct = ov && ov.total > 0 ? (ov.done / ov.total) * 100 : 0;
  const openTasks = ov ? ov.total - ov.done : 0;
  const overduePct = ov && openTasks > 0 ? (ov.overdueTasks / openTasks) * 100 : 0;

  const assigneeRows: AssigneeRow[] = (ov?.assignees ?? []).map((a) => ({
    userId: a.userId ?? "unassigned",
    displayName: a.displayName,
    pct: a.total > 0 ? (a.done / a.total) * 100 : 0,
    done: a.done,
    total: a.total,
    overdue: a.overdue,
    hoursLogged: a.hoursLogged,
  }));

  return (
    <AppShell title={project ? `${project.key} · Dashboard` : "Dashboard"}>
      <Section variant="transparent" padding={5} maxWidth={1400}>
        <VStack gap={6} hAlign="stretch">
          <ProjectTabs projectId={id} />

          {/* KPI tiles — dashboard widget, đúng vai trò của Card. */}
          <Grid columns={{ minWidth: 260, repeat: "fit" }} gap={5}>
            <StatTile
              title="Tổng công việc"
              value={(ov?.total ?? 0).toLocaleString()}
              delta={ov?.createdDelta}
              visual={<BarSparkline values={(ov?.trend ?? []).map((t) => t.created)} />}
            />
            <StatTile
              title="Đã hoàn thành"
              value={(ov?.done ?? 0).toLocaleString()}
              delta={ov?.completedDelta}
              visual={<AreaSparkline values={(ov?.trend ?? []).map((t) => t.completed)} />}
            />
            <StatTile
              title="Chưa hoàn thành"
              value={openTasks.toLocaleString()}
              visual={
                <RingProgress
                  percent={100 - donePct}
                  color="var(--color-icon-orange)"
                  track="var(--color-track)"
                />
              }
            />
            <StatTile
              title="Quá hạn"
              value={(ov?.overdueTasks ?? 0).toLocaleString()}
              visual={
                <RingProgress
                  percent={overduePct}
                  color="var(--color-error)"
                  track="var(--color-track)"
                />
              }
            />
          </Grid>

          <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={5}>
            <MiniStat
              icon="data_usage"
              label="Story points"
              value={`${ov?.storyPointsDone ?? 0}/${ov?.storyPointsTotal ?? 0}`}
            />
            <MiniStat icon="task_alt" label="Hoàn thành" value={`${Math.round(donePct)}%`} />
            <MiniStat icon="schedule" label="Giờ đã log" value={hours(ov?.hoursLogged ?? 0)} />
            <MiniStat icon="payments" label="Chi phí thực tế" value={money(ov?.costActual ?? 0)} />
          </Grid>

          <Card padding={6}>
            <VStack gap={2} hAlign="stretch">
              <HStack gap={2} vAlign="center">
                <Heading level={3}>Biểu đồ công việc</Heading>
                <StackItem size="fill" />
                <Text type="supporting">6 tháng gần nhất</Text>
              </HStack>
              <TrendAreaChart
                labels={trendLabels}
                rows={trendRows}
                series={[
                  { key: "created", label: "Tạo mới", color: "var(--color-icon-purple)" },
                  { key: "inWork", label: "Đang làm", color: "var(--color-icon-green)" },
                  { key: "completed", label: "Hoàn thành", color: "var(--color-icon-blue)" },
                ]}
              />
            </VStack>
          </Card>

          <Grid columns={{ minWidth: 360, repeat: "fit" }} gap={6}>
            <Card padding={6}>
              <VStack gap={5} hAlign="stretch">
                <Heading level={3}>Theo trạng thái</Heading>
                {segments.length > 0 ? <Donut segments={segments} /> : <Empty />}
              </VStack>
            </Card>
            <Card padding={6}>
              <VStack gap={5} hAlign="stretch">
                <Heading level={3}>Theo độ ưu tiên</Heading>
                {prioBars.length > 0 ? <BarList items={prioBars} /> : <Empty />}
              </VStack>
            </Card>
          </Grid>

          <Card padding={6}>
            <VStack gap={2} hAlign="stretch">
              <HStack gap={2} vAlign="center">
                <Heading level={3}>Giờ làm việc theo tháng</Heading>
                <StackItem size="fill" />
                <Text type="supporting">Từ worklog</Text>
              </HStack>
              <TrendAreaChart
                labels={trendLabels}
                rows={hoursRows}
                height={220}
                valueSuffix="h"
                series={[{ key: "hours", label: "Giờ đã log", color: "var(--color-icon-cyan)" }]}
              />
            </VStack>
          </Card>

          <Card padding={0}>
            <VStack gap={0} hAlign="stretch">
              <Section variant="transparent" padding={5} dividers={["bottom"]}>
                <Heading level={3}>Phân bổ theo nhân sự</Heading>
              </Section>
              {assigneeRows.length === 0 ? (
                <EmptyState title="Chưa có công việc nào." />
              ) : (
                // Dữ liệu cột dày → Table, không bọc từng dòng trong Card.
                <Table<AssigneeRow>
                  data={assigneeRows}
                  idKey="userId"
                  density="compact"
                  hasHover
                  columns={[
                    {
                      key: "displayName",
                      header: "Thành viên",
                      width: proportional(1.5),
                      renderCell: (r) => (
                        <HStack gap={3} vAlign="center">
                          <Avatar name={r.displayName} size={32} tooltip={false} />
                          <Text weight="semibold" maxLines={1}>
                            {r.displayName}
                          </Text>
                        </HStack>
                      ),
                    },
                    {
                      key: "pct",
                      header: "Tiến độ",
                      width: proportional(1),
                      renderCell: (r) => (
                        <HStack gap={2} vAlign="center">
                          <StackItem size="fill">
                            <ProgressBar
                              label={`Tiến độ ${r.displayName}`}
                              isLabelHidden
                              value={r.pct}
                              variant={r.pct === 100 ? "success" : "accent"}
                            />
                          </StackItem>
                          <Text type="supporting" hasTabularNumbers>
                            {Math.round(r.pct)}%
                          </Text>
                        </HStack>
                      ),
                    },
                    {
                      key: "done",
                      header: "Việc",
                      width: pixel(90),
                      align: "end",
                      renderCell: (r) => (
                        <Text hasTabularNumbers>
                          {r.done}/{r.total}
                        </Text>
                      ),
                    },
                    {
                      key: "overdue",
                      header: "Quá hạn",
                      width: pixel(90),
                      align: "end",
                      renderCell: (r) => (
                        <Text
                          weight="semibold"
                          hasTabularNumbers
                          color={r.overdue > 0 ? "accent" : "secondary"}>
                          {r.overdue}
                        </Text>
                      ),
                    },
                    {
                      key: "hoursLogged",
                      header: "Giờ",
                      width: pixel(90),
                      align: "end",
                      renderCell: (r) => <Text hasTabularNumbers>{hours(r.hoursLogged)}</Text>,
                    },
                  ]}
                />
              )}
            </VStack>
          </Card>
        </VStack>
      </Section>
    </AppShell>
  );
}

function MiniStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <Card padding={5}>
      <HStack gap={4} vAlign="center">
        <Icon name={icon} size={22} />
        <VStack gap={0.5}>
          <Text type="large" weight="bold" maxLines={1}>
            {value}
          </Text>
          <Text type="supporting">{label}</Text>
        </VStack>
      </HStack>
    </Card>
  );
}

function Empty() {
  return <Text type="supporting">Chưa có dữ liệu.</Text>;
}
