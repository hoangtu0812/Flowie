"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import { Selector } from "@astryxdesign/core/Selector";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Link as AstryxLink } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { api, ProjectStats, TrendRange, WorkspaceOverview } from "@/lib/api";
import Icon from "@/components/ui/Icon";
import { Donut, BarList } from "@/components/ui/Charts";
import { TrendAreaChart } from "@/components/ui/DashboardCharts";
import { PRIORITY_HEX, statusSegments } from "@/lib/status";
import { trendLabel, money, hours } from "@/lib/format";

interface ProjectRow extends Record<string, unknown> {
  projectId: string;
  key: string;
  name: string;
  pct: number;
  hoursLogged: number;
  overdue: number;
}

/**
 * Built-in workspace analytics — the numbers everyone needs, with no setup.
 *
 * This used to be a separate /analytics page that only ever showed one project
 * at a time. It now defaults to the whole workspace and lets you narrow to a
 * single project, which is what the old page did.
 */
export default function AnalyticsTab({ workspaceId }: { workspaceId: string }) {
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [scope, setScope] = useState(""); // "" = whole workspace
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [range, setRange] = useState<TrendRange>("30d");

  useEffect(() => {
    if (!workspaceId) return;
    api.workspaceOverview(workspaceId, range).then(setOverview).catch(() => setOverview(null));
  }, [workspaceId, range]);

  useEffect(() => {
    if (!scope) {
      setStats(null);
      return;
    }
    api.projectStats(scope).then(setStats).catch(() => setStats(null));
  }, [scope]);

  // One shape for both scopes so the charts below don't branch.
  const view = useMemo(() => {
    if (scope && stats) {
      return {
        total: stats.total,
        done: stats.done,
        hoursLogged: stats.hoursLogged,
        costActual: stats.costActual,
        byStatus: stats.byStatus,
        byPriority: stats.byPriority,
      };
    }
    if (!scope && overview) {
      return {
        total: overview.totalTasks,
        done: overview.doneTasks,
        hoursLogged: overview.hoursLogged,
        costActual: overview.costActual,
        byStatus: overview.byStatus,
        byPriority: overview.byPriority,
      };
    }
    return null;
  }, [scope, stats, overview]);

  const trendLabels = useMemo(
    () => (overview?.trend ?? []).map((t) => trendLabel(t.month)),
    [overview],
  );
  const trendRows = useMemo(
    () =>
      (overview?.trend ?? []).map((t) => ({
        created: t.created,
        inWork: t.inWork,
        completed: t.completed,
      })),
    [overview],
  );

  // Colours/labels come from the project's own workflow columns, so a status
  // added in Settings charts correctly instead of as a grey "wait" slice.
  const segments = useMemo(
    () => statusSegments(view?.byStatus ?? {}, overview?.statusMeta ?? []),
    [view, overview],
  );
  const prioBars = useMemo(
    () =>
      Object.entries(view?.byPriority ?? {}).map(([k, v]) => ({
        label: k,
        value: v,
        color: PRIORITY_HEX[k] ?? "var(--color-accent)",
      })),
    [view],
  );

  if (!overview) return <Text color="secondary">Đang tải…</Text>;

  const completion = view && view.total > 0 ? Math.round((view.done / view.total) * 100) : 0;

  const projectRows: ProjectRow[] = overview.projects.map((p) => ({
    projectId: p.projectId,
    key: p.key,
    name: p.name,
    pct: p.total > 0 ? (p.done / p.total) * 100 : 0,
    hoursLogged: p.hoursLogged,
    overdue: p.overdue,
  }));

  return (
    <VStack gap={5} hAlign="stretch">
      <HStack gap={4} vAlign="center">
        <Text type="supporting">
          {scope ? "Số liệu của một dự án" : "Số liệu tổng hợp toàn không gian làm việc"}
        </Text>
        <StackItem size="fill" />
        <Selector
          label="Phạm vi"
          isLabelHidden
          size="sm"
          value={scope}
          onChange={(v) => setScope(v ?? "")}
          placeholder="Tất cả dự án"
          options={[
            { value: "", label: "Tất cả dự án" },
            ...overview.projects.map((p) => ({
              value: p.projectId,
              label: `${p.key} · ${p.name}`,
            })),
          ]}
        />
      </HStack>

      {/* KPI tiles — đúng vai trò của Card theo `astryx docs layout`. */}
      <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={4}>
        <Kpi icon="task_alt" label="Hoàn thành" value={`${completion}%`} />
        <Kpi icon="checklist" label="Việc" value={`${view?.done ?? 0}/${view?.total ?? 0}`} />
        <Kpi icon="schedule" label="Giờ đã log" value={hours(view?.hoursLogged ?? 0)} />
        <Kpi icon="payments" label="Chi phí thực tế" value={money(view?.costActual ?? 0)} />
      </Grid>

      <Grid columns={{ minWidth: 360, repeat: "fit" }} gap={5}>
        <Card padding={5}>
          <VStack gap={5} hAlign="stretch">
            <Heading level={3}>Theo trạng thái</Heading>
            {segments.length > 0 ? <Donut segments={segments} /> : <Empty />}
          </VStack>
        </Card>
        <Card padding={5}>
          <VStack gap={5} hAlign="stretch">
            <Heading level={3}>Theo độ ưu tiên</Heading>
            {prioBars.length > 0 ? <BarList items={prioBars} /> : <Empty />}
          </VStack>
        </Card>
      </Grid>

      {!scope && (
        <Card padding={5}>
          <VStack gap={4} hAlign="stretch">
            <HStack gap={2} vAlign="center" wrap="wrap">
              <Heading level={3}>Xu hướng công việc</Heading>
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
              height={240}
              series={[
                { key: "created", label: "Tạo mới", color: "var(--color-icon-purple)" },
                { key: "inWork", label: "Đang làm", color: "var(--color-icon-green)" },
                { key: "completed", label: "Hoàn thành", color: "var(--color-icon-blue)" },
              ]}
            />
          </VStack>
        </Card>
      )}

      {!scope && (
        <Card padding={0}>
          <VStack gap={0} hAlign="stretch">
            <Heading level={3}>Tiến độ theo dự án</Heading>
            {projectRows.length === 0 ? (
              <EmptyState title="Chưa có dự án." isCompact />
            ) : (
              // Dữ liệu cột dày → Table, không bọc từng dòng trong Card.
              <Table<ProjectRow>
                data={projectRows}
                idKey="projectId"
                density="compact"
                hasHover
                columns={[
                  {
                    key: "name",
                    header: "Dự án",
                    width: proportional(2),
                    renderCell: (r) => (
                      <AstryxLink href={`/projects/${r.projectId}`} as={Link}>
                        {r.key} · {r.name}
                      </AstryxLink>
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
                    key: "hoursLogged",
                    header: "Giờ",
                    width: pixel(90),
                    align: "end",
                    renderCell: (r) => (
                      <Text type="supporting" hasTabularNumbers>
                        {r.hoursLogged.toFixed(1)}
                      </Text>
                    ),
                  },
                  {
                    key: "overdue",
                    header: "Quá hạn",
                    width: pixel(90),
                    align: "end",
                    renderCell: (r) => (
                      <Text weight="semibold" hasTabularNumbers color={r.overdue > 0 ? "accent" : "secondary"}>
                        {r.overdue}
                      </Text>
                    ),
                  },
                ]}
              />
            )}
          </VStack>
        </Card>
      )}
    </VStack>
  );
}

function Kpi({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <Card padding={5}>
      <HStack gap={4} vAlign="center">
        <Icon name={icon} size={22} />
        <VStack gap={0.5}>
          <Text type="display-3" weight="bold" maxLines={1}>
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
