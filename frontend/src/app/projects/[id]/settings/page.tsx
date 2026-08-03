"use client";

import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import { Section } from "@astryxdesign/core/Section";
import { Card } from "@astryxdesign/core/Card";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { TextInput } from "@astryxdesign/core/TextInput";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Code } from "@astryxdesign/core/Code";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { api, Integration, Project, Webhook, WorkflowStatus } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import ProjectTabs from "@/components/layout/ProjectTabs";
import { statusChipStyle } from "@/lib/status";
import ColorPicker from "@/components/ui/ColorPicker";

const CATEGORIES = [
  { key: "todo", label: "Chưa làm" },
  { key: "in_progress", label: "Đang làm" },
  { key: "done", label: "Hoàn thành" },
];

/** Chip màu cột: màu do người dùng chọn (hex bất kỳ), nên phải đặt lúc chạy. */
function StatusChip({ name, color }: { name: string; color: string }) {
  const style: CSSProperties = {
    ...statusChipStyle(color),
    paddingInline: "var(--spacing-3)",
    paddingBlock: "var(--spacing-1)",
    borderRadius: "999px",
    fontWeight: 700,
    fontSize: "0.75rem",
    whiteSpace: "nowrap",
  };
  return <span style={style}>{name}</span>;
}

export default function ProjectSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("todo");
  const [color, setColor] = useState("#2563eb");
  const [wip, setWip] = useState("");

  const load = useCallback(() => {
    api.listStatuses(id).then(setStatuses).catch(() => setStatuses([]));
  }, [id]);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    load();
  }, [id, load]);

  async function addStatus() {
    const n = name.trim();
    if (!n) return;
    setError(null);
    try {
      const limit = wip.trim() === "" ? null : Number(wip);
      await api.createStatus(id, { name: n, category, color, wipLimit: limit });
      setName("");
      setWip("");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function patch(s: WorkflowStatus, data: Record<string, unknown>) {
    setError(null);
    try {
      await api.updateStatus(id, s.id, data);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(s: WorkflowStatus) {
    if (
      !window.confirm(
        `Xoá cột "${s.name}"?\nCác công việc trong cột này sẽ được chuyển sang cột đầu tiên.`,
      )
    )
      return;
    setError(null);
    try {
      await api.deleteStatus(id, s.id);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function moveCol(s: WorkflowStatus, dir: -1 | 1) {
    const i = statuses.findIndex((x) => x.id === s.id);
    const j = i + dir;
    if (j < 0 || j >= statuses.length) return;
    // Swap positions with the neighbour.
    await api.updateStatus(id, s.id, { position: statuses[j].position }).catch(() => {});
    await api.updateStatus(id, statuses[j].id, { position: s.position }).catch(() => {});
    load();
  }

  return (
    <AppShell title={project ? `${project.key} · Cài đặt` : "Cài đặt dự án"}>
      {/* Archetype "Settings / forms": Section + FormLayout, Card để gom nhóm. */}
      <Section variant="transparent" padding={5} maxWidth={896}>
        <VStack gap={5} hAlign="stretch">
          <ProjectTabs projectId={id} />

          <Card padding={5}>
            <VStack gap={4} hAlign="stretch">
              <VStack gap={1}>
                <Heading level={3}>Cột trạng thái (Workflow)</Heading>
                <Text type="supporting">
                  Các cột hiển thị trên Board/List của dự án này. Đặt WIP limit để chặn đưa quá
                  nhiều việc vào một cột cùng lúc.
                </Text>
              </VStack>

              {error && (
                <Banner status="error" title={error} isDismissable onDismiss={() => setError(null)} />
              )}

              {/* Danh sách cột = record quét bằng mắt → rows, không Card từng dòng. */}
              {statuses.length === 0 ? (
                <EmptyState
                  title="Dự án chưa có cột tuỳ chỉnh"
                  description="Board đang dùng bộ cột mặc định."
                  isCompact
                />
              ) : (
                <List hasDividers>
                  {statuses.map((s, i) => (
                    <ListItem
                      key={s.id}
                      startContent={
                        <VStack gap={0}>
                          <IconButton
                            label="Lên"
                            tooltip="Lên"
                            variant="ghost"
                            size="sm"
                            icon={<Icon name="keyboard_arrow_up" size={18} />}
                            isDisabled={i === 0}
                            onClick={() => moveCol(s, -1)}
                          />
                          <IconButton
                            label="Xuống"
                            tooltip="Xuống"
                            variant="ghost"
                            size="sm"
                            icon={<Icon name="keyboard_arrow_down" size={18} />}
                            isDisabled={i === statuses.length - 1}
                            onClick={() => moveCol(s, 1)}
                          />
                        </VStack>
                      }
                      label={<StatusChip name={s.name} color={s.color} />}
                      description={`${s.key} · ${s.taskCount} việc`}
                      endContent={
                        <HStack gap={2} vAlign="center" wrap="wrap">
                          <Selector
                            label="Nhóm"
                            isLabelHidden
                            size="sm"
                            value={s.category}
                            onChange={(v) => patch(s, { category: v })}
                            options={CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
                          />
                          <ColorPicker value={s.color} onChange={(c) => patch(s, { color: c })} />
                          <NumberInput
                            label="WIP limit"
                            isLabelHidden
                            size="sm"
                            width={96}
                            min={0}
                            placeholder="WIP"
                            value={s.wipLimit ?? undefined}
                            onChange={(v) => {
                              if (v == null && s.wipLimit != null) patch(s, { clearWip: true });
                              else if (v != null && v !== s.wipLimit) patch(s, { wipLimit: v });
                            }}
                          />
                          <IconButton
                            label="Xoá cột"
                            tooltip="Xoá cột"
                            variant="ghost"
                            size="sm"
                            icon={<Icon name="delete" size={18} />}
                            onClick={() => remove(s)}
                          />
                        </HStack>
                      }
                    />
                  ))}
                </List>
              )}

              <Section variant="transparent" padding={0} dividers={["top"]}>
                <VStack gap={3} hAlign="stretch" paddingBlock={3}>
                  <Text type="label" color="secondary">
                    Thêm cột mới
                  </Text>
                  <HStack gap={3} vAlign="end" wrap="wrap">
                    <TextInput
                      label="Tên cột"
                      placeholder="Tên cột (VD: Blocked)"
                      value={name}
                      onChange={setName}
                    />
                    <Selector
                      label="Nhóm"
                      value={category}
                      onChange={(v) => setCategory(v ?? "todo")}
                      options={CATEGORIES.map((c) => ({ value: c.key, label: c.label }))}
                    />
                    <ColorPicker value={color} onChange={setColor} />
                    <NumberInput
                      label="WIP limit"
                      isOptional
                      width={120}
                      min={0}
                      value={wip === "" ? undefined : Number(wip)}
                      onChange={(v) => setWip(v == null ? "" : String(v))}
                    />
                    <Button
                      label="Thêm cột"
                      variant="primary"
                      icon={<Icon name="add" size={18} />}
                      isDisabled={!name.trim()}
                      clickAction={addStatus}
                    />
                  </HStack>
                </VStack>
              </Section>
            </VStack>
          </Card>

          <IntegrationsCard projectId={id} />
          <WebhooksCard projectId={id} />
        </VStack>
      </Section>
    </AppShell>
  );
}

/** Events the backend can deliver, in the order they occur in a task's life. */
const WEBHOOK_EVENTS = [
  { key: "task.created", label: "Tạo công việc" },
  { key: "task.updated", label: "Sửa công việc" },
  { key: "task.status_changed", label: "Đổi trạng thái" },
  { key: "task.assigned", label: "Giao việc" },
  { key: "task.completed", label: "Hoàn thành" },
  { key: "task.deleted", label: "Xoá công việc" },
  { key: "comment.created", label: "Bình luận mới" },
];

/**
 * Outgoing webhooks — POST project events to any HTTPS endpoint, signed with
 * HMAC-SHA256 so the receiver can verify the payload came from Flowie.
 */
function WebhooksCard({ projectId }: { projectId: string }) {
  const [list, setList] = useState<Webhook[]>([]);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<string[]>(["task.created", "task.status_changed"]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listWebhooks(projectId).then(setList).catch(() => setList([]));
  }, [projectId]);
  useEffect(() => {
    load();
  }, [load]);

  function toggleEvent(key: string) {
    setEvents((prev) => (prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key]));
  }

  async function add() {
    setErr(null);
    try {
      await api.createWebhook(projectId, {
        url: url.trim(),
        events,
        secret: secret.trim() || undefined,
      });
      setUrl("");
      setSecret("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Card padding={5}>
      <VStack gap={4} hAlign="stretch">
        <VStack gap={1}>
          <Heading level={3}>Webhook ra ngoài</Heading>
          <Text type="supporting">
            Gửi sự kiện dự án dưới dạng JSON POST tới hệ thống của bạn. Nếu đặt secret, mỗi
            request kèm chữ ký HMAC-SHA256 ở header <Code>X-Flowie-Signature</Code>.
          </Text>
        </VStack>

        {err && <Banner status="error" title={err} isDismissable onDismiss={() => setErr(null)} />}

        {list.length === 0 ? (
          <EmptyState title="Chưa có webhook nào." isCompact />
        ) : (
          <List hasDividers>
            {list.map((w) => (
              <ListItem
                key={w.id}
                label={w.url}
                description={[
                  w.events.length === 0 ? "mọi sự kiện" : `${w.events.length} sự kiện`,
                  w.lastError ? `Lỗi lần gửi cuối: ${w.lastError}` : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
                endContent={
                  <HStack gap={2} vAlign="center">
                    {w.hasSecret && (
                      <Badge variant="success" label="ký" icon={<Icon name="lock" size={14} />} />
                    )}
                    {w.lastStatus != null && (
                      <Badge
                        variant={w.lastStatus < 300 ? "success" : "error"}
                        label={w.lastStatus}
                      />
                    )}
                    <IconButton
                      label="Xoá webhook"
                      tooltip="Xoá webhook"
                      variant="ghost"
                      size="sm"
                      icon={<Icon name="delete" size={18} />}
                      clickAction={async () => {
                        if (!window.confirm("Xoá webhook này?")) return;
                        await api.deleteWebhook(projectId, w.id).catch((e) => setErr(e.message));
                        load();
                      }}
                    />
                  </HStack>
                }
              />
            ))}
          </List>
        )}

        <Section variant="transparent" padding={0} dividers={["top"]}>
          <VStack gap={3} hAlign="stretch" paddingBlock={3}>
            <HStack gap={3} wrap="wrap" vAlign="end">
              <StackItem size="fill">
                <TextInput
                  label="URL nhận webhook"
                  placeholder="https://api.congty.vn/flowie-hook"
                  value={url}
                  onChange={setUrl}
                />
              </StackItem>
              <TextInput
                label="Secret"
                isOptional
                width={208}
                placeholder="Secret (tuỳ chọn)"
                value={secret}
                onChange={setSecret}
              />
            </HStack>
            <HStack gap={1} wrap="wrap">
              {WEBHOOK_EVENTS.map((e) => (
                <ToggleButton
                  key={e.key}
                  label={e.label}
                  size="sm"
                  isPressed={events.includes(e.key)}
                  onPressedChange={() => toggleEvent(e.key)}
                />
              ))}
            </HStack>
            <HStack>
              <Button
                label="Thêm webhook"
                variant="primary"
                icon={<Icon name="add" size={18} />}
                isDisabled={!url.trim()}
                clickAction={add}
              />
            </HStack>
          </VStack>
        </Section>
      </VStack>
    </Card>
  );
}

/** Connect Slack / MS Teams incoming webhooks to project events. */
function IntegrationsCard({ projectId }: { projectId: string }) {
  const [list, setList] = useState<Integration[]>([]);
  const [provider, setProvider] = useState("slack");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listIntegrations(projectId).then(setList).catch(() => setList([]));
  }, [projectId]);
  useEffect(() => {
    load();
  }, [load]);

  async function add() {
    setErr(null);
    try {
      await api.createIntegration(projectId, { provider, webhookUrl: url.trim() });
      setUrl("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Card padding={5}>
      <VStack gap={4} hAlign="stretch">
        <VStack gap={1}>
          <Heading level={3}>Tích hợp Chat</Heading>
          <Text type="supporting">
            Gửi thông báo sự kiện dự án sang Slack hoặc Microsoft Teams qua Incoming Webhook.
          </Text>
        </VStack>

        {err && <Banner status="error" title={err} isDismissable onDismiss={() => setErr(null)} />}

        {list.length === 0 ? (
          <EmptyState title="Chưa có tích hợp nào." isCompact />
        ) : (
          <List hasDividers>
            {list.map((i) => (
              <ListItem
                key={i.id}
                startContent={
                  <Badge variant={i.provider === "slack" ? "purple" : "blue"} label={i.provider} />
                }
                label={`${i.webhookUrl.slice(0, 48)}…`}
                endContent={
                  <HStack gap={2} vAlign="center">
                    {i.lastStatus != null && (
                      <Badge
                        variant={i.lastStatus < 300 ? "success" : "error"}
                        label={i.lastStatus}
                      />
                    )}
                    <IconButton
                      label="Xoá tích hợp"
                      tooltip="Xoá tích hợp"
                      variant="ghost"
                      size="sm"
                      icon={<Icon name="delete" size={18} />}
                      clickAction={async () => {
                        if (!window.confirm("Xoá tích hợp này?")) return;
                        await api
                          .deleteIntegration(projectId, i.id)
                          .catch((e) => setErr(e.message));
                        load();
                      }}
                    />
                  </HStack>
                }
              />
            ))}
          </List>
        )}

        <Section variant="transparent" padding={0} dividers={["top"]}>
          <HStack gap={3} vAlign="end" wrap="wrap" paddingBlock={3}>
            <Selector
              label="Nền tảng"
              value={provider}
              onChange={(v) => setProvider(v ?? "slack")}
              options={[
                { value: "slack", label: "Slack" },
                { value: "teams", label: "MS Teams" },
              ]}
            />
            <StackItem size="fill">
              <TextInput
                label="Incoming webhook URL"
                placeholder="https://hooks.slack.com/services/…"
                value={url}
                onChange={setUrl}
              />
            </StackItem>
            <Button
              label="Kết nối"
              variant="primary"
              icon={<Icon name="add" size={18} />}
              isDisabled={!url.trim()}
              clickAction={add}
            />
          </HStack>
        </Section>
      </VStack>
    </Card>
  );
}
