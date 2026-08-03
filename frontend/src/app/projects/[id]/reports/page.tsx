"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Section } from "@astryxdesign/core/Section";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import { Selector } from "@astryxdesign/core/Selector";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import {
  api,
  Project,
  Sprint,
  SprintBurndown,
  SprintCapacity,
  VelocityPoint,
} from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import ProjectTabs from "@/components/layout/ProjectTabs";
import { TrendAreaChart, GroupedBarChart } from "@/components/ui/DashboardCharts";

interface CapacityRow extends Record<string, unknown> {
  userId: string;
  displayName: string;
  share: number;
  points: number;
  doneTasks: number;
  tasks: number;
}

export default function ProjectReportsPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [sprints, setSprints] = useState<Sprint[]>([]);
  const [selected, setSelected] = useState("");
  const [burndown, setBurndown] = useState<SprintBurndown | null>(null);
  const [capacity, setCapacity] = useState<SprintCapacity | null>(null);
  const [velocity, setVelocity] = useState<VelocityPoint[]>([]);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    api.projectVelocity(id).then(setVelocity).catch(() => setVelocity([]));
    api
      .listSprints(id)
      .then((ss) => {
        setSprints(ss);
        // Prefer the active sprint, else the last one.
        const active = ss.find((s) => s.state === "active") ?? ss[ss.length - 1];
        if (active) setSelected(active.id);
      })
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    if (!selected) return;
    api.sprintBurndown(selected).then(setBurndown).catch(() => setBurndown(null));
    api.sprintCapacity(selected).then(setCapacity).catch(() => setCapacity(null));
  }, [selected]);

  const burnLabels = useMemo(
    () => (burndown?.points ?? []).map((p) => p.date.slice(5)), // MM-DD
    [burndown],
  );
  const burnRows = useMemo(
    () =>
      (burndown?.points ?? []).map((p) => ({
        remaining: p.remaining,
        ideal: Math.round(p.ideal * 10) / 10,
      })),
    [burndown],
  );

  const velLabels = useMemo(() => velocity.map((v) => v.name), [velocity]);
  const velRows = useMemo(
    () => velocity.map((v) => ({ committed: v.committed, completed: v.completed })),
    [velocity],
  );

  const donePct =
    capacity && capacity.totalPoints > 0
      ? Math.round((capacity.donePoints / capacity.totalPoints) * 100)
      : 0;

  const capacityRows: CapacityRow[] = (capacity?.byAssignee ?? []).map((a) => ({
    userId: a.userId ?? "unassigned",
    displayName: a.displayName,
    share: capacity && capacity.totalPoints > 0 ? (a.points / capacity.totalPoints) * 100 : 0,
    points: a.points,
    doneTasks: a.doneTasks,
    tasks: a.tasks,
  }));

  const actions =
    sprints.length > 0 ? (
      <Selector
        label="Sprint"
        isLabelHidden
        size="sm"
        value={selected}
        onChange={(v) => setSelected(v ?? "")}
        options={sprints.map((s) => ({
          value: s.id,
          label: `${s.name}${s.state === "active" ? " · đang chạy" : s.state === "completed" ? " · đã xong" : ""}`,
        }))}
      />
    ) : undefined;

  return (
    <AppShell
      title={project ? `${project.key} · Agile Reports` : "Agile Reports"}
      actions={actions}>
      <Section variant="transparent" padding={5} maxWidth={1400}>
        <VStack gap={6} hAlign="stretch">
          <ProjectTabs projectId={id} />

          {sprints.length === 0 ? (
            <EmptyState
              title="Chưa có sprint nào"
              description="Tạo sprint ở tab Sprints để xem báo cáo Agile."
              icon={<Icon name="sprint" size={40} />}
            />
          ) : (
            <>
              <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={5}>
                <MiniStat
                  icon="data_usage"
                  label="Story points"
                  value={`${burndown?.donePoints ?? 0}/${burndown?.totalPoints ?? 0}`}
                />
                <MiniStat
                  icon="checklist"
                  label="Công việc"
                  value={`${burndown?.doneTasks ?? 0}/${burndown?.totalTasks ?? 0}`}
                />
                <MiniStat icon="task_alt" label="Hoàn thành" value={`${donePct}%`} />
                <MiniStat
                  icon="event"
                  label="Thời gian"
                  value={
                    burndown?.startDate && burndown?.endDate
                      ? `${burndown.startDate.slice(5, 10)} → ${burndown.endDate.slice(5, 10)}`
                      : "Chưa đặt"
                  }
                />
              </Grid>

              <Card padding={6}>
                <VStack gap={2} hAlign="stretch">
                  <HStack gap={2} vAlign="center">
                    <Heading level={3}>Burndown Chart</Heading>
                    <StackItem size="fill" />
                    <Text type="supporting">{burndown?.name}</Text>
                  </HStack>
                  {burnRows.length > 0 ? (
                    <TrendAreaChart
                      labels={burnLabels}
                      rows={burnRows}
                      height={280}
                      series={[
                        {
                          key: "remaining",
                          label: "Còn lại (thực tế)",
                          color: "var(--color-error)",
                        },
                        { key: "ideal", label: "Lý tưởng", color: "var(--color-icon-gray)" },
                      ]}
                    />
                  ) : (
                    <Text type="supporting">Sprint chưa có công việc nào để vẽ burndown.</Text>
                  )}
                  {burndown && burndown.totalPoints === 0 && burndown.totalTasks > 0 && (
                    <Text type="supporting">
                      Các công việc chưa được ước lượng story points — biểu đồ sẽ phẳng. Đặt story
                      points trong TaskDrawer để burndown có ý nghĩa.
                    </Text>
                  )}
                </VStack>
              </Card>

              <Card padding={6}>
                <VStack gap={2} hAlign="stretch">
                  <HStack gap={2} vAlign="center">
                    <Heading level={3}>Velocity Chart</Heading>
                    <StackItem size="fill" />
                    <Text type="supporting">Theo từng sprint</Text>
                  </HStack>
                  <GroupedBarChart
                    labels={velLabels}
                    rows={velRows}
                    series={[
                      { key: "committed", label: "Cam kết", color: "var(--color-background-blue)" },
                      { key: "completed", label: "Hoàn thành", color: "var(--color-icon-blue)" },
                    ]}
                  />
                </VStack>
              </Card>

              <Card padding={0}>
                <VStack gap={0} hAlign="stretch">
                  <Section variant="transparent" padding={5} dividers={["bottom"]}>
                    <Heading level={3}>Sprint Capacity</Heading>
                  </Section>
                  {capacityRows.length === 0 ? (
                    <EmptyState title="Sprint chưa có công việc nào." />
                  ) : (
                    // Dữ liệu cột dày → Table, không bọc từng dòng trong Card.
                    <Table<CapacityRow>
                      data={capacityRows}
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
                          key: "share",
                          header: "Tải",
                          width: proportional(1),
                          renderCell: (r) => (
                            <HStack gap={2} vAlign="center">
                              <StackItem size="fill">
                                <ProgressBar
                                  label={`Tải của ${r.displayName}`}
                                  isLabelHidden
                                  value={r.share}
                                  variant={r.share > 50 ? "warning" : "accent"}
                                />
                              </StackItem>
                              <Text type="supporting" hasTabularNumbers>
                                {Math.round(r.share)}%
                              </Text>
                            </HStack>
                          ),
                        },
                        {
                          key: "points",
                          header: "Points",
                          width: pixel(90),
                          align: "end",
                          renderCell: (r) => <Text hasTabularNumbers>{r.points}</Text>,
                        },
                        {
                          key: "tasks",
                          header: "Việc",
                          width: pixel(90),
                          align: "end",
                          renderCell: (r) => (
                            <Text hasTabularNumbers>
                              {r.doneTasks}/{r.tasks}
                            </Text>
                          ),
                        },
                      ]}
                    />
                  )}
                </VStack>
              </Card>
            </>
          )}
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
