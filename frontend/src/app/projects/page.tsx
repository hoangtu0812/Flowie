"use client";

import { useCallback, useEffect, useState } from "react";
import { Section } from "@astryxdesign/core/Section";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Button } from "@astryxdesign/core/Button";
import { Badge } from "@astryxdesign/core/Badge";
import { Token } from "@astryxdesign/core/Token";
import { Text } from "@astryxdesign/core/Text";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { api, ProjectSummary, WorkspaceOverview } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import NewProjectDialog from "@/components/project/NewProjectDialog";
import { useWorkspace } from "@/lib/useWorkspace";
import { money } from "@/lib/format";

/**
 * Project directory.
 *
 * Cards show live progress (from the workspace overview) rather than just a
 * name, and link straight into the project's Overview tab so the destination is
 * the same whether you arrive from here or from the dashboard table.
 */
export default function ProjectsPage() {
  const { workspaces, workspace, workspaceId, setWorkspaceId, loading } = useWorkspace();
  const [overview, setOverview] = useState<WorkspaceOverview | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const load = useCallback(() => {
    if (!workspaceId) return;
    api.workspaceOverview(workspaceId).then(setOverview).catch(() => setOverview(null));
  }, [workspaceId]);

  useEffect(() => {
    load();
  }, [load]);

  const projects = (overview?.projects ?? []).filter((p) =>
    query ? (p.name + p.key).toLowerCase().includes(query.toLowerCase()) : true,
  );

  const actions = (
    <HStack gap={2} vAlign="center">
      {workspaces.length > 1 && (
        <Selector
          label="Không gian làm việc"
          isLabelHidden
          size="sm"
          value={workspaceId}
          onChange={setWorkspaceId}
          options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
        />
      )}
      <Button
        label="Dự án mới"
        variant="primary"
        size="sm"
        icon={<Icon name="add" size={18} />}
        isDisabled={!workspaceId}
        onClick={() => setOpen(true)}
      />
    </HStack>
  );

  return (
    <AppShell title="Dự án" actions={actions}>
      <Section variant="transparent" padding={5} maxWidth={1400}>
        {loading && <Text color="secondary">Đang tải…</Text>}

        {!loading && !workspace && (
          <EmptyState
            title="Chưa có không gian làm việc"
            description="Bạn chưa thuộc workspace nào. Liên hệ quản trị viên để được thêm vào."
            icon={<Icon name="workspaces" size={40} />}
          />
        )}

        {!loading && workspace && (
          <VStack gap={5} hAlign="stretch">
            <HStack gap={4} vAlign="center" wrap="wrap">
              <Icon name="workspaces" size={18} />
              <Text type="supporting">{workspace.name}</Text>
              <Badge label={`${overview?.projects.length ?? 0} dự án`} />
              <StackItem size="fill" />
              <TextInput
                label="Tìm dự án"
                isLabelHidden
                size="sm"
                width={256}
                placeholder="Tìm dự án…"
                value={query}
                onChange={setQuery}
              />
            </HStack>

            {/* Gallery chọn dự án → card grid là đúng vai trò của Card. */}
            <Grid columns={{ minWidth: 300, repeat: "fit" }} gap={5}>
              {projects.map((p) => (
                <ProjectCard key={p.projectId} p={p} />
              ))}

              {/* Creating a project is a first-class card, not a hidden button. */}
              <ClickableCard
                label="Tạo dự án mới"
                variant="muted"
                padding={6}
                height={168}
                onClick={() => setOpen(true)}>
                <VStack gap={2} hAlign="center" vAlign="center" height="100%">
                  <Icon name="add_circle" size={28} />
                  <Text weight="medium">Tạo dự án mới</Text>
                </VStack>
              </ClickableCard>
            </Grid>
          </VStack>
        )}
      </Section>

      {open && workspaceId && (
        <NewProjectDialog
          workspaceId={workspaceId}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            load();
          }}
        />
      )}
    </AppShell>
  );
}

function ProjectCard({ p }: { p: ProjectSummary }) {
  const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
  return (
    <ClickableCard label={p.name} href={`/projects/${p.projectId}`} padding={5} height="100%">
      <VStack gap={3} hAlign="stretch">
        <HStack gap={2} vAlign="center">
          <Token label={p.key} />
          <StackItem size="fill" />
          {p.overdue > 0 && <Badge variant="error" label={`${p.overdue} quá hạn`} />}
        </HStack>

        <Text type="large" weight="bold" maxLines={1}>
          {p.name}
        </Text>

        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <ProgressBar
              label={`Tiến độ ${p.name}`}
              isLabelHidden
              value={pct}
              variant={pct === 100 ? "success" : "accent"}
            />
          </StackItem>
          <Text type="supporting" weight="semibold" hasTabularNumbers>
            {pct}%
          </Text>
        </HStack>

        <HStack gap={4} wrap="wrap">
          <Text type="supporting">
            {p.done}/{p.total} việc
          </Text>
          <Text type="supporting">{p.inProgress} đang làm</Text>
          <Text type="supporting">{p.hoursLogged.toFixed(1)}h</Text>
          {p.costActual > 0 && <Text type="supporting">{money(p.costActual)}</Text>}
        </HStack>
      </VStack>
    </ClickableCard>
  );
}
