"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Banner } from "@astryxdesign/core/Banner";
import { Text } from "@astryxdesign/core/Text";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { api, Project, ScheduledReport } from "@/lib/api";
import Icon from "@/components/ui/Icon";

const FREQUENCIES = [
  { key: "daily", label: "Hằng ngày" },
  { key: "weekly", label: "Hằng tuần (thứ Hai)" },
  { key: "monthly", label: "Hằng tháng (ngày 1)" },
];

const PROVIDERS = [
  { key: "slack", label: "Slack" },
  { key: "teams", label: "Microsoft Teams" },
  { key: "webhook", label: "Webhook tuỳ ý" },
];

/**
 * Scheduled digests. The backend has shipped these since Module 5.2 but there
 * was no way to create one outside of curl, so nobody knew they existed.
 */
export default function ScheduledReportsTab({ workspaceId }: { workspaceId: string }) {
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("weekly");
  const [provider, setProvider] = useState("slack");
  const [channelUrl, setChannelUrl] = useState("");
  const [hourUtc, setHourUtc] = useState(1); // 01:00 UTC ≈ 08:00 giờ VN
  const [projectId, setProjectId] = useState("");

  const load = useCallback(() => {
    if (!workspaceId) return;
    api.listReports(workspaceId).then(setReports).catch(() => setReports([]));
    api.listProjects(workspaceId).then(setProjects).catch(() => setProjects([]));
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setError(null);
    try {
      await api.createReport(workspaceId, {
        name: name.trim(),
        frequency,
        provider,
        channelUrl: channelUrl.trim(),
        hourUtc,
        projectId: projectId || null,
      });
      setCreating(false);
      setName("");
      setChannelUrl("");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function runNow(r: ScheduledReport) {
    setError(null);
    setNotice(null);
    try {
      await api.runReportNow(workspaceId, r.id);
      setNotice(`Đã gửi thử “${r.name}”.`);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <VStack gap={5} hAlign="stretch">
      <HStack gap={4} vAlign="start">
        <Text type="supporting">
          Tự động gửi bản tóm tắt tiến độ vào Slack/Teams theo lịch. Giờ tính theo UTC — Việt
          Nam là UTC+7.
        </Text>
        <StackItem size="fill" />
        <Button
          label="Lịch gửi mới"
          variant="primary"
          icon={<Icon name="add" size={18} />}
          onClick={() => setCreating((v) => !v)}
        />
      </HStack>

      {error && <Banner status="error" title={error} />}
      {notice && <Banner status="success" title={notice} isDismissable onDismiss={() => setNotice(null)} />}

      {creating && (
        <Card padding={5}>
          <VStack gap={4} hAlign="stretch">
            <Grid columns={{ minWidth: 240, repeat: "fit" }} gap={4}>
              <TextInput
                label="Tên"
                placeholder="Tóm tắt tuần"
                value={name}
                onChange={setName}
                hasAutoFocus
              />
              <Selector
                label="Phạm vi"
                value={projectId}
                onChange={(v) => setProjectId(v ?? "")}
                placeholder="Toàn bộ workspace"
                options={[
                  { value: "", label: "Toàn bộ workspace" },
                  ...projects.map((p) => ({ value: p.id, label: `${p.key} · ${p.name}` })),
                ]}
              />
              <Selector
                label="Tần suất"
                value={frequency}
                onChange={(v) => setFrequency(v ?? "weekly")}
                options={FREQUENCIES.map((f) => ({ value: f.key, label: f.label }))}
              />
              <Selector
                label="Giờ gửi (UTC)"
                description={`${String(hourUtc).padStart(2, "0")}:00 UTC = ${String((hourUtc + 7) % 24).padStart(2, "0")}:00 giờ VN`}
                value={String(hourUtc)}
                onChange={(v) => setHourUtc(Number(v ?? 0))}
                options={Array.from({ length: 24 }, (_, h) => ({
                  value: String(h),
                  label: `${String(h).padStart(2, "0")}:00`,
                }))}
              />
              <Selector
                label="Kênh"
                value={provider}
                onChange={(v) => setProvider(v ?? "slack")}
                options={PROVIDERS.map((p) => ({ value: p.key, label: p.label }))}
              />
              <TextInput
                label="Incoming webhook URL"
                placeholder="https://hooks.slack.com/services/…"
                value={channelUrl}
                onChange={setChannelUrl}
              />
            </Grid>
            <HStack gap={2} justify="end">
              <Button label="Huỷ" variant="ghost" onClick={() => setCreating(false)} />
              <Button
                label="Tạo lịch"
                variant="primary"
                isDisabled={!name.trim() || !channelUrl.trim()}
                clickAction={create}
              />
            </HStack>
          </VStack>
        </Card>
      )}

      {reports.length === 0 ? (
        <EmptyState
          title="Chưa có lịch gửi báo cáo nào."
          icon={<Icon name="schedule_send" size={40} />}
        />
      ) : (
        // Danh sách lịch = record quét bằng mắt → rows edge-to-edge.
        <List hasDividers>
          {reports.map((r) => (
            <ListItem
              key={r.id}
              label={r.name}
              description={[
                FREQUENCIES.find((f) => f.key === r.frequency)?.label ?? r.frequency,
                `${String(r.hourUtc).padStart(2, "0")}:00 UTC`,
                PROVIDERS.find((p) => p.key === r.provider)?.label ?? r.provider,
                r.projectId
                  ? projects.find((p) => p.id === r.projectId)?.key ?? "dự án"
                  : "toàn workspace",
                r.lastRunAt
                  ? `Lần gửi cuối: ${new Date(r.lastRunAt).toLocaleString()}${r.lastError ? ` — lỗi: ${r.lastError}` : ` — HTTP ${r.lastStatus}`}`
                  : "",
              ]
                .filter(Boolean)
                .join(" · ")}
              endContent={
                <HStack gap={1} vAlign="center">
                  <Button
                    label="Gửi thử"
                    variant="ghost"
                    size="sm"
                    icon={<Icon name="send" size={18} />}
                    clickAction={() => runNow(r)}
                  />
                  <IconButton
                    label="Xoá lịch"
                    tooltip="Xoá lịch"
                    variant="ghost"
                    size="sm"
                    icon={<Icon name="delete" size={18} />}
                    clickAction={async () => {
                      if (!window.confirm(`Xoá lịch "${r.name}"?`)) return;
                      await api.deleteReport(workspaceId, r.id).catch((e) => setError(e.message));
                      load();
                    }}
                  />
                </HStack>
              }
            />
          ))}
        </List>
      )}
    </VStack>
  );
}
