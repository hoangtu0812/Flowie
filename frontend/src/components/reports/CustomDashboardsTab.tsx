"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { Banner } from "@astryxdesign/core/Banner";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import {
  api,
  Dashboard,
  DashboardWidget,
  Project,
  VelocityPoint,
  WorkspaceOverview,
} from "@/lib/api";
import Icon from "@/components/ui/Icon";
import { Donut, BarList } from "@/components/ui/Charts";
import { TrendAreaChart, GroupedBarChart, StatTile } from "@/components/ui/DashboardCharts";
import { PRIORITY_HEX, statusSegments } from "@/lib/status";
import { trendLabel, money, hours } from "@/lib/format";

const WIDGET_TYPES = [
  { key: "kpi", label: "Chỉ số (KPI)" },
  { key: "status_donut", label: "Tròn: theo trạng thái" },
  { key: "priority_bar", label: "Cột: theo ưu tiên" },
  { key: "trend", label: "Xu hướng công việc" },
  { key: "project_table", label: "Bảng tiến độ dự án" },
  { key: "velocity", label: "Velocity theo sprint" },
];

const KPI_METRICS = [
  { key: "totalTasks", label: "Tổng công việc" },
  { key: "doneTasks", label: "Đã hoàn thành" },
  { key: "overdueTasks", label: "Quá hạn" },
  { key: "projectCount", label: "Số dự án" },
  { key: "memberCount", label: "Thành viên" },
  { key: "hoursLogged", label: "Giờ đã log" },
  { key: "costActual", label: "Chi phí thực tế" },
];

interface WidgetProjectRow extends Record<string, unknown> {
  projectId: string;
  key: string;
  pct: number;
  overdue: number;
}

/**
 * User-built dashboards.
 *
 * The built-in Analytics tab answers the standard questions; this tab is for
 * the ones it doesn't — pick your own widgets, save them per workspace, share
 * with the team.
 */
export default function CustomDashboardsTab({ workspaceId }: { workspaceId: string }) {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [activeId, setActiveId] = useState("");
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [velocity, setVelocity] = useState<VelocityPoint[]>([]);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newShared, setNewShared] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // widget builder state
  const [wType, setWType] = useState("kpi");
  const [wTitle, setWTitle] = useState("");
  const [wMetric, setWMetric] = useState("totalTasks");
  const [wProject, setWProject] = useState("");
  const [wWidth, setWWidth] = useState(1);

  const loadDashboards = useCallback(() => {
    if (!workspaceId) return;
    api
      .listDashboards(workspaceId)
      .then((ds) => {
        setDashboards(ds);
        setActiveId((cur) => (ds.some((d) => d.id === cur) ? cur : ds[0]?.id ?? ""));
      })
      .catch(() => setDashboards([]));
  }, [workspaceId]);

  useEffect(() => {
    if (!workspaceId) return;
    loadDashboards();
    api.workspaceOverview(workspaceId).then(setOverview).catch(() => setOverview(null));
    api.listProjects(workspaceId).then(setProjects).catch(() => setProjects([]));
  }, [workspaceId, loadDashboards]);

  const active = dashboards.find((d) => d.id === activeId) ?? null;

  // Velocity is per-project, so fetch it only when a widget needs it.
  useEffect(() => {
    const needs = active?.widgets.find((w) => w.type === "velocity");
    const pid = needs?.config?.projectId as string | undefined;
    if (pid) api.projectVelocity(pid).then(setVelocity).catch(() => setVelocity([]));
    else setVelocity([]);
  }, [active]);

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

  async function createDashboard() {
    if (!newName.trim()) return;
    try {
      const d = await api.createDashboard(workspaceId, newName.trim(), newShared);
      setDashboards((p) => [...p, d]);
      setActiveId(d.id);
      setCreating(false);
      setNewName("");
      setNewShared(false);
      setEditing(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function addWidget() {
    if (!active) return;
    const config: Record<string, unknown> = {};
    if (wType === "kpi") config.metric = wMetric;
    if ((wType === "velocity" || wType === "status_donut") && wProject)
      config.projectId = wProject;
    try {
      await api.addWidget(active.id, {
        type: wType,
        title: wTitle.trim() || WIDGET_TYPES.find((t) => t.key === wType)?.label || wType,
        config,
        width: wWidth,
      });
      setWTitle("");
      loadDashboards();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <VStack gap={5} hAlign="stretch">
      {error && <Banner status="error" title={error} isDismissable onDismiss={() => setError(null)} />}

      <HStack gap={2} vAlign="center" wrap="wrap">
        {dashboards.map((d) => (
          <ToggleButton
            key={d.id}
            label={d.name}
            size="sm"
            icon={d.shared ? <Icon name="group" size={16} /> : undefined}
            isPressed={activeId === d.id}
            onPressedChange={() => setActiveId(d.id)}
          />
        ))}
        <Button
          label="Dashboard mới"
          variant="ghost"
          size="sm"
          icon={<Icon name="add" size={18} />}
          onClick={() => setCreating(true)}
        />
        <StackItem size="fill" />
        {active && (
          <Button
            label={editing ? "Xong" : "Sửa"}
            variant="ghost"
            size="sm"
            icon={<Icon name={editing ? "done" : "edit"} size={18} />}
            onClick={() => setEditing((v) => !v)}
          />
        )}
      </HStack>

      {creating && (
        <Card padding={5}>
          <HStack gap={3} vAlign="end" wrap="wrap">
            <StackItem size="fill">
              <TextInput
                label="Tên dashboard"
                placeholder="Báo cáo tuần cho ban lãnh đạo"
                value={newName}
                onChange={setNewName}
                hasAutoFocus
                onEnter={createDashboard}
              />
            </StackItem>
            <CheckboxInput
              label="Chia sẻ cho cả nhóm"
              value={newShared}
              onChange={setNewShared}
            />
            <Button
              label="Tạo"
              variant="primary"
              isDisabled={!newName.trim()}
              clickAction={createDashboard}
            />
            <Button label="Huỷ" variant="ghost" onClick={() => setCreating(false)} />
          </HStack>
        </Card>
      )}

      {dashboards.length === 0 && !creating ? (
        <EmptyState
          title="Chưa có dashboard tuỳ chỉnh"
          description="Tab “Phân tích” đã có sẵn số liệu chuẩn. Tạo dashboard riêng khi bạn cần ghép các chỉ số theo cách khác."
          icon={<Icon name="dashboard_customize" size={40} />}
        />
      ) : (
        <>
          {editing && active && (
            <Card padding={5}>
              <VStack gap={4} hAlign="stretch">
                <Heading level={3}>Thêm widget</Heading>
                <HStack gap={3} vAlign="end" wrap="wrap">
                  <Selector
                    label="Loại widget"
                    value={wType}
                    onChange={(v) => setWType(v ?? "kpi")}
                    options={WIDGET_TYPES.map((t) => ({ value: t.key, label: t.label }))}
                  />
                  {wType === "kpi" && (
                    <Selector
                      label="Chỉ số"
                      value={wMetric}
                      onChange={(v) => setWMetric(v ?? "totalTasks")}
                      options={KPI_METRICS.map((m) => ({ value: m.key, label: m.label }))}
                    />
                  )}
                  {wType === "velocity" && (
                    <Selector
                      label="Dự án"
                      value={wProject}
                      onChange={(v) => setWProject(v ?? "")}
                      placeholder="Chọn dự án…"
                      options={projects.map((p) => ({
                        value: p.id,
                        label: `${p.key} · ${p.name}`,
                      }))}
                    />
                  )}
                  <TextInput
                    label="Tiêu đề"
                    isOptional
                    placeholder="Tiêu đề (tuỳ chọn)"
                    value={wTitle}
                    onChange={setWTitle}
                  />
                  <Selector
                    label="Độ rộng"
                    value={String(wWidth)}
                    onChange={(v) => setWWidth(Number(v ?? 1))}
                    options={[
                      { value: "1", label: "Rộng 1" },
                      { value: "2", label: "Rộng 2" },
                      { value: "3", label: "Rộng 3" },
                    ]}
                  />
                  <Button
                    label="Thêm"
                    variant="primary"
                    icon={<Icon name="add" size={18} />}
                    clickAction={addWidget}
                  />
                  <StackItem size="fill" />
                  <Button
                    label="Xoá dashboard"
                    variant="destructive"
                    icon={<Icon name="delete" size={18} />}
                    clickAction={async () => {
                      if (!window.confirm(`Xoá dashboard "${active.name}"?`)) return;
                      await api.deleteDashboard(active.id).catch((e) => setError(e.message));
                      loadDashboards();
                    }}
                  />
                </HStack>
              </VStack>
            </Card>
          )}

          {/* Widget dashboard → card grid là đúng vai trò của Card. */}
          {active && active.widgets.length === 0 ? (
            <EmptyState title="Dashboard trống" description="Bật “Sửa” để thêm widget." />
          ) : (
            <Grid columns={3} gap={6}>
              {(active?.widgets ?? []).map((wdg) => (
                <div
                  key={wdg.id}
                  // Widget tự khai độ rộng 1–3 cột; giá trị đến từ dữ liệu người
                  // dùng lưu nên phải đặt lúc chạy, không token hoá được.
                  style={{ gridColumn: `span ${Math.min(3, Math.max(1, wdg.width))}` }}>
                  <Card padding={6} height="100%">
                    <VStack gap={4} hAlign="stretch">
                      <HStack gap={2} vAlign="center">
                        <Heading level={3}>{wdg.title}</Heading>
                        <StackItem size="fill" />
                        {editing && (
                          <IconButton
                            label="Xoá widget"
                            tooltip="Xoá widget"
                            variant="ghost"
                            size="sm"
                            icon={<Icon name="close" size={18} />}
                            clickAction={async () => {
                              await api.deleteWidget(active!.id, wdg.id).catch(() => {});
                              loadDashboards();
                            }}
                          />
                        )}
                      </HStack>
                      <WidgetBody
                        widget={wdg}
                        overview={overview}
                        trendLabels={trendLabels}
                        trendRows={trendRows}
                        velocity={velocity}
                      />
                    </VStack>
                  </Card>
                </div>
              ))}
            </Grid>
          )}
        </>
      )}
    </VStack>
  );
}

/** Renders one widget according to its type + config. */
function WidgetBody({
  widget,
  overview,
  trendLabels,
  trendRows,
  velocity,
}: {
  widget: DashboardWidget;
  overview: WorkspaceOverview | null;
  trendLabels: string[];
  trendRows: Record<string, number>[];
  velocity: VelocityPoint[];
}) {
  if (!overview) return <Text type="supporting">Đang tải…</Text>;

  switch (widget.type) {
    case "kpi": {
      const metric = String(widget.config?.metric ?? "totalTasks");
      const raw = (overview as unknown as Record<string, number>)[metric] ?? 0;
      const value =
        metric === "costActual"
          ? money(raw)
          : metric === "hoursLogged"
            ? hours(raw)
            : raw.toLocaleString();
      const delta =
        metric === "doneTasks"
          ? overview.completedDelta
          : metric === "totalTasks"
            ? overview.createdDelta
            : undefined;
      return (
        <StatTile
          title={KPI_METRICS.find((m) => m.key === metric)?.label ?? metric}
          value={value}
          delta={delta}
          invertDelta={metric === "overdueTasks"}
        />
      );
    }
    case "status_donut": {
      // Labels and colours come from the project's workflow columns.
      const segs = statusSegments(overview.byStatus, overview.statusMeta ?? []);
      return segs.length > 0 ? <Donut segments={segs} /> : <Empty />;
    }
    case "priority_bar": {
      const items = Object.entries(overview.byPriority).map(([k, v]) => ({
        label: k,
        value: v,
        color: PRIORITY_HEX[k] ?? "var(--color-accent)",
      }));
      return items.length > 0 ? <BarList items={items} /> : <Empty />;
    }
    case "trend":
      return (
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
      );
    case "velocity":
      return velocity.length > 0 ? (
        <GroupedBarChart
          labels={velocity.map((v) => v.name)}
          rows={velocity.map((v) => ({ committed: v.committed, completed: v.completed }))}
          height={220}
          series={[
            { key: "committed", label: "Cam kết", color: "var(--color-background-blue)" },
            { key: "completed", label: "Hoàn thành", color: "var(--color-icon-blue)" },
          ]}
        />
      ) : (
        <Text type="supporting">Chọn dự án có sprint để xem velocity.</Text>
      );
    case "project_table": {
      const rows: WidgetProjectRow[] = overview.projects.map((p) => ({
        projectId: p.projectId,
        key: p.key,
        pct: p.total > 0 ? (p.done / p.total) * 100 : 0,
        overdue: p.overdue,
      }));
      if (rows.length === 0) return <EmptyState title="Chưa có dự án." isCompact />;
      return (
        <Table<WidgetProjectRow>
          data={rows}
          idKey="projectId"
          density="compact"
          columns={[
            {
              key: "key",
              header: "Dự án",
              width: pixel(90),
              renderCell: (r) => <Text weight="semibold">{r.key}</Text>,
            },
            {
              key: "pct",
              header: "Tiến độ",
              width: proportional(1),
              renderCell: (r) => (
                <HStack gap={2} vAlign="center">
                  <StackItem size="fill">
                    <ProgressBar
                      label={`Tiến độ ${r.key}`}
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
              key: "overdue",
              header: "Quá hạn",
              width: pixel(90),
              renderCell: (r) => (
                <Text
                  weight="semibold"
                  hasTabularNumbers
                  justify="end"
                  color={r.overdue > 0 ? "accent" : "secondary"}>
                  {r.overdue}
                </Text>
              ),
            },
          ]}
        />
      );
    }
    default:
      return <Text type="supporting">Loại widget chưa hỗ trợ.</Text>;
  }
}

function Empty() {
  return <Text type="supporting">Chưa có dữ liệu.</Text>;
}
