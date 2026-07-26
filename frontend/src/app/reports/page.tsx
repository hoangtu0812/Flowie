"use client";

import { useState } from "react";
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
      <select className="field w-auto" value={workspaceId} onChange={(e) => setWorkspaceId(e.target.value)}>
        {workspaces.map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
      </select>
    ) : undefined;

  return (
    <AppShell title="Báo cáo" actions={actions}>
      <div className="p-lg max-w-[1400px]">
        <TabStrip tabs={TABS} active={tab} onChange={setTab} className="mb-lg" />

        {loading && <p className="text-on-surface-variant">Đang tải…</p>}

        {!loading && !workspaceId && (
          <div className="card p-xl text-center text-on-surface-variant">
            Bạn chưa thuộc không gian làm việc nào.
          </div>
        )}

        {!loading && workspaceId && (
          <>
            {tab === "analytics" && <AnalyticsTab workspaceId={workspaceId} />}
            {tab === "custom" && <CustomDashboardsTab workspaceId={workspaceId} />}
            {tab === "scheduled" && <ScheduledReportsTab workspaceId={workspaceId} />}
            {tab === "audit" && <AuditLogTab workspaceId={workspaceId} />}
          </>
        )}
      </div>
    </AppShell>
  );
}
