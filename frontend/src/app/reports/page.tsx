"use client";

import { useState } from "react";
import { Section } from "@astryxdesign/core/Section";
import { VStack } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Text } from "@astryxdesign/core/Text";
import AppShell from "@/components/layout/AppShell";
import TabStrip from "@/components/ui/TabStrip";
import AnalyticsTab from "@/components/reports/AnalyticsTab";
import CustomDashboardsTab from "@/components/reports/CustomDashboardsTab";
import ScheduledReportsTab from "@/components/reports/ScheduledReportsTab";
import AuditLogTab from "@/components/reports/AuditLogTab";
import { useWorkspace } from "@/lib/useWorkspace";

/**
 * Reporting hub.
 *
 * Analytics and custom Dashboards used to be two sidebar entries showing the
 * same workspace numbers, which left no obvious answer to "which one do I
 * open?". They are now tabs of one page: Analytics is the built-in view,
 * Dashboards is the build-your-own view, plus the two operational surfaces
 * (scheduled digests, audit trail) that had backends but no UI.
 */
const TABS = [
  { key: "analytics", label: "Phân tích", icon: "insights" },
  { key: "custom", label: "Dashboard tuỳ chỉnh", icon: "dashboard_customize" },
  { key: "scheduled", label: "Gửi định kỳ", icon: "schedule_send" },
  { key: "audit", label: "Nhật ký", icon: "history" },
];

export default function ReportsPage() {
  const { workspaces, workspaceId, setWorkspaceId, loading } = useWorkspace();
  const [tab, setTab] = useState("analytics");

  const actions =
    workspaces.length > 1 ? (
      <Selector
        label="Không gian làm việc"
        isLabelHidden
        value={workspaceId}
        onChange={setWorkspaceId}
        options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
        size="sm"
      />
    ) : undefined;

  return (
    <AppShell title="Báo cáo" actions={actions}>
      <Section variant="transparent" padding={5} maxWidth={1400}>
        <VStack gap={5} hAlign="stretch">
          <TabStrip tabs={TABS} active={tab} onChange={setTab} />

          {loading && <Text color="secondary">Đang tải…</Text>}

          {!loading && !workspaceId && (
            <EmptyState
              title="Bạn chưa thuộc không gian làm việc nào"
              description="Liên hệ quản trị viên để được cấp quyền."
            />
          )}

          {!loading && workspaceId && (
            <>
              {tab === "analytics" && <AnalyticsTab workspaceId={workspaceId} />}
              {tab === "custom" && <CustomDashboardsTab workspaceId={workspaceId} />}
              {tab === "scheduled" && <ScheduledReportsTab workspaceId={workspaceId} />}
              {tab === "audit" && <AuditLogTab workspaceId={workspaceId} />}
            </>
          )}
        </VStack>
      </Section>
    </AppShell>
  );
}
