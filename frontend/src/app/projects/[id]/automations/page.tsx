"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Section } from "@astryxdesign/core/Section";
import { Card } from "@astryxdesign/core/Card";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Selector } from "@astryxdesign/core/Selector";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Token } from "@astryxdesign/core/Token";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { api, AutomationRule, Member, Project } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import ProjectTabs from "@/components/layout/ProjectTabs";
import { STATUSES, StatusDef, toStatusDefs } from "@/lib/status";

export default function AutomationsPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState({ triggerStatus: "in_review", assigneeId: "", name: "" });
  const [error, setError] = useState<string | null>(null);
  /** Columns configured for this project, not the built-in four. A status
   *  added in Settings never showed up in the trigger dropdown before. */
  const [statusDefs, setStatusDefs] = useState<StatusDef[]>(STATUSES);

  const load = useCallback(() => {
    api.listAutomations(id).then(setRules).catch(() => setRules([]));
  }, [id]);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    api
      .projectMembers(id)
      .then((m) => {
        setMembers(m);
        if (m.length > 0) setForm((f) => ({ ...f, assigneeId: m[0].userId }));
      })
      .catch(() => {});
    api
      .listStatuses(id)
      .then((ss) => {
        const defs = toStatusDefs(ss);
        setStatusDefs(defs);
        // Default the trigger to a real column of this project.
        setForm((f) =>
          defs.some((d) => d.key === f.triggerStatus)
            ? f
            : { ...f, triggerStatus: defs[0]?.key ?? f.triggerStatus },
        );
      })
      .catch(() => {});
    load();
  }, [id, load]);

  const memberName = (uid?: string) => members.find((m) => m.userId === uid)?.displayName || "—";
  const statusLabel = (k: string) => statusDefs.find((s) => s.key === k)?.label || k;

  async function create() {
    setError(null);
    try {
      await api.createAutomation(id, form);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <AppShell
      title={
        <HStack gap={2} vAlign="center">
          {project && <Token label={project.key} />}
          <Text weight="bold">{project?.name || "Project"}</Text>
        </HStack>
      }>
      <Section variant="transparent" padding={5}>
        <VStack gap={5} hAlign="stretch">
          {project && <ProjectTabs projectId={id} />}

          <VStack gap={4} hAlign="stretch" maxWidth={768}>
            <VStack gap={1}>
              <Heading level={2}>Automation</Heading>
              <Text type="supporting">
                Quy tắc Trigger → Action: khi task chuyển sang một trạng thái, tự động gán cho
                người phụ trách (và gửi thông báo).
              </Text>
            </VStack>

            {/* Card ở đây gom một nhóm điều khiển tạo mới — đúng vai trò Card. */}
            <Card padding={5}>
              <HStack gap={3} vAlign="end" wrap="wrap">
                <Selector
                  label="Khi status →"
                  value={form.triggerStatus}
                  onChange={(v) => setForm({ ...form, triggerStatus: v ?? "" })}
                  options={statusDefs.map((s) => ({ value: s.key, label: s.label }))}
                />
                <Selector
                  label="Tự động gán cho"
                  value={form.assigneeId}
                  onChange={(v) => setForm({ ...form, assigneeId: v ?? "" })}
                  placeholder="-- Chọn --"
                  options={members.map((m) => ({
                    value: m.userId,
                    label: m.displayName || m.email,
                  }))}
                  status={error ? { type: "error", message: error } : undefined}
                />
                <Button
                  label="Thêm rule"
                  variant="primary"
                  icon={<Icon name="add" size={18} />}
                  isDisabled={!form.assigneeId}
                  clickAction={create}
                />
              </HStack>
            </Card>

            {/* Danh sách quy tắc = record quét bằng mắt → rows, không Card. */}
            {rules.length === 0 ? (
              <EmptyState title="Chưa có quy tắc nào." />
            ) : (
              <List hasDividers>
                {rules.map((r) => (
                  <ListItem
                    key={r.id}
                    startContent={<Token label={statusLabel(r.triggerStatus)} />}
                    label={`→ Gán cho ${memberName(r.actionAssigneeId)}`}
                    endContent={
                      <IconButton
                        label="Xoá quy tắc"
                        tooltip="Xoá quy tắc"
                        variant="ghost"
                        size="sm"
                        icon={<Icon name="delete" size={18} />}
                        clickAction={async () => {
                          await api.deleteAutomation(r.id).catch(() => {});
                          load();
                        }}
                      />
                    }
                  />
                ))}
              </List>
            )}
          </VStack>
        </VStack>
      </Section>
    </AppShell>
  );
}
