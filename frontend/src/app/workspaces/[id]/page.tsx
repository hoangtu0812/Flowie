"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Section } from "@astryxdesign/core/Section";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import { Breadcrumbs, BreadcrumbItem } from "@astryxdesign/core/Breadcrumbs";
import { DropdownMenu } from "@astryxdesign/core/DropdownMenu";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Token } from "@astryxdesign/core/Token";
import { Link as AstryxLink } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { api, Project, TrendRange, Workspace, WorkspaceOverview } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import {
  StatTile,
  BarSparkline,
  AreaSparkline,
  RingProgress,
  TrendAreaChart,
} from "@/components/ui/DashboardCharts";
import NewProjectDialog from "@/components/project/NewProjectDialog";
import NewTaskDialog from "@/components/task/NewTaskDialog";
import { trendLabel } from "@/lib/format";

const usd = (n: number) => n.toLocaleString(undefined, { style: "currency", currency: "USD" });

interface RollupRow extends Record<string, unknown> {
  projectId: string;
  key: string;
  name: string;
  pct: number;
  done: number;
  total: number;
  inProgress: number;
  overdue: number;
  hoursLogged: number;
  costActual: number;
}

export default function WorkspacePage() {
  const { id } = useParams<{ id: string }>();
  const [ws, setWs] = useState<Workspace | null>(null);
  const [ov, setOv] = useState<WorkspaceOverview | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  /** null = closed; otherwise which creation dialog is open. */
  const [dialog, setDialog] = useState<"project" | "task" | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Trend chart window. 30 days is the default — it's the horizon people act on. */
  const [range, setRange] = useState<TrendRange>("30d");

  const reload = useCallback(() => {
    api.workspaceOverview(id, range).then(setOv).catch(() => {});
    api.listProjects(id).then(setProjects).catch((e) => setError(e.message));
  }, [id, range]);

  useEffect(() => {
    api.getWorkspace(id).then(setWs).catch(() => {});
    reload();
  }, [id, reload]);

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

  const donePct = ov && ov.totalTasks > 0 ? (ov.doneTasks / ov.totalTasks) * 100 : 0;
  const openTasks = ov ? ov.totalTasks - ov.doneTasks : 0;
  const overduePct = openTasks > 0 && ov ? (ov.overdueTasks / openTasks) * 100 : 0;

  const rollupRows: RollupRow[] = (ov?.projects ?? []).map((p) => ({
    projectId: p.projectId,
    key: p.key,
    name: p.name,
    pct: p.total > 0 ? (p.done / p.total) * 100 : 0,
    done: p.done,
    total: p.total,
    inProgress: p.inProgress,
    overdue: p.overdue,
    hoursLogged: p.hoursLogged,
    costActual: p.costActual,
  }));

  // A single "Tạo mới" affordance on the dashboard — previously the only way
  // to create anything was to already be inside a project.
  const actions = (
    <DropdownMenu
      button={{ label: "Tạo mới", variant: "primary", icon: <Icon name="add" size={20} /> }}
      items={[
        {
          label: "Dự án mới",
          icon: <Icon name="folder_open" size={18} />,
          onClick: () => setDialog("project"),
        },
        {
          label: "Công việc mới",
          icon: <Icon name="check_circle" size={18} />,
          isDisabled: projects.length === 0,
          onClick: () => setDialog("task"),
        },
        {
          label: "Lịch họp / sự kiện",
          icon: <Icon name="event" size={18} />,
          onClick: () => {
            window.location.href = "/calendar";
          },
        },
      ]}
    />
  );

  return (
    <AppShell title={ws?.name || "Workspace"} actions={actions}>
      <Section variant="transparent" padding={5} maxWidth={1400}>
        <VStack gap={6} hAlign="stretch">
          <Breadcrumbs label="Đường dẫn">
            <BreadcrumbItem href="/" as={Link}>
              Dashboard
            </BreadcrumbItem>
            <BreadcrumbItem isCurrent>{ws?.name ?? ""}</BreadcrumbItem>
          </Breadcrumbs>

          {error && <Banner status="error" title={error} />}

          {/* KPI tiles — dashboard widget, đúng vai trò của Card. */}
          <Grid columns={{ minWidth: 260, repeat: "fit" }} gap={5}>
            <StatTile
              title="Tổng công việc"
              value={(ov?.totalTasks ?? 0).toLocaleString()}
              delta={ov?.createdDelta}
              visual={<BarSparkline values={(ov?.trend ?? []).map((t) => t.created)} />}
            />
            <StatTile
              title="Đã hoàn thành"
              value={(ov?.doneTasks ?? 0).toLocaleString()}
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
            <MiniStat icon="folder_open" label="Dự án" value={String(ov?.projectCount ?? 0)} />
            <MiniStat icon="group" label="Thành viên" value={String(ov?.memberCount ?? 0)} />
            <MiniStat
              icon="schedule"
              label="Giờ đã log"
              value={`${(ov?.hoursLogged ?? 0).toFixed(1)}h`}
            />
            <MiniStat icon="payments" label="Chi phí thực tế" value={usd(ov?.costActual ?? 0)} />
          </Grid>

          <Card padding={6}>
            <VStack gap={2} hAlign="stretch">
              <HStack gap={2} vAlign="center" wrap="wrap">
                <Heading level={3}>Biểu đồ công việc</Heading>
                <StackItem size="fill" />
                <SegmentedControl
                  label="Khoảng thời gian"
                  size="sm"
                  value={range}
                  onChange={(v) => setRange(v as TrendRange)}>
                  <SegmentedControlItem value="30d" label="30 ngày" />
                  <SegmentedControlItem value="6m" label="6 tháng" />
                  <SegmentedControlItem value="12m" label="12 tháng" />
                </SegmentedControl>
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

          <Card padding={0}>
            <VStack gap={0} hAlign="stretch">
              <Section variant="transparent" padding={5} dividers={["bottom"]}>
                <Heading level={3}>Tiến độ theo dự án</Heading>
              </Section>
              {rollupRows.length === 0 ? (
                <EmptyState title="Chưa có dự án nào." />
              ) : (
                // Dữ liệu cột dày → Table, không bọc từng dòng trong Card.
                <Table<RollupRow>
                  data={rollupRows}
                  idKey="projectId"
                  density="compact"
                  hasHover
                  columns={[
                    {
                      key: "name",
                      header: "Dự án",
                      width: proportional(2),
                      renderCell: (r) => (
                        // Same destination as the sidebar's project list, so a
                        // project always opens the same way.
                        <HStack gap={3} vAlign="center">
                          <Token label={r.key} />
                          <AstryxLink href={`/projects/${r.projectId}`} as={Link}>
                            {r.name}
                          </AstryxLink>
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
                              label={`Tiến độ ${r.name}`}
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
                      width: pixel(80),
                      align: "end",
                      renderCell: (r) => (
                        <Text hasTabularNumbers>
                          {r.done}/{r.total}
                        </Text>
                      ),
                    },
                    {
                      key: "inProgress",
                      header: "Đang làm",
                      width: pixel(90),
                      align: "end",
                      renderCell: (r) => <Text hasTabularNumbers>{r.inProgress}</Text>,
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
                      width: pixel(80),
                      align: "end",
                      renderCell: (r) => (
                        <Text hasTabularNumbers>{r.hoursLogged.toFixed(1)}h</Text>
                      ),
                    },
                    {
                      key: "costActual",
                      header: "Chi phí",
                      width: pixel(120),
                      align: "end",
                      renderCell: (r) => <Text hasTabularNumbers>{usd(r.costActual)}</Text>,
                    },
                  ]}
                />
              )}
            </VStack>
          </Card>

          {/* The rollup table above already lists every project with live numbers,
              so the old duplicate card grid was removed in favour of one link. */}
          {projects.length === 0 ? (
            <EmptyState
              title="Chưa có dự án nào"
              description="Tạo dự án đầu tiên để bắt đầu theo dõi công việc."
              icon={<Icon name="folder_open" size={40} />}
              actions={
                <Button
                  label="Dự án mới"
                  variant="primary"
                  icon={<Icon name="add" size={18} />}
                  onClick={() => setDialog("project")}
                />
              }
            />
          ) : (
            <AstryxLink href="/projects" as={Link}>
              Xem tất cả {projects.length} dự án
            </AstryxLink>
          )}
        </VStack>
      </Section>

      {dialog === "project" && (
        <NewProjectDialog
          workspaceId={id}
          onClose={() => setDialog(null)}
          onCreated={() => {
            setDialog(null);
            reload();
          }}
        />
      )}
      {dialog === "task" && (
        <NewTaskDialog
          workspaceId={id}
          onClose={() => setDialog(null)}
          onCreated={() => {
            setDialog(null);
            reload();
          }}
        />
      )}
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
