"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Section } from "@astryxdesign/core/Section";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { Card } from "@astryxdesign/core/Card";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Token } from "@astryxdesign/core/Token";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { api, Member, Project, Task } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import ProjectTabs from "@/components/layout/ProjectTabs";
import TaskDrawer from "@/components/task/TaskDrawer";

const CAPACITY = 20; // story points/sprint (giả định)

export default function WorkloadPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [openTask, setOpenTask] = useState<string | null>(null);

  const reload = useCallback(() => {
    api.listTasks(id).then(setTasks).catch(() => {});
  }, [id]);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    api.projectMembers(id).then(setMembers).catch(() => {});
    reload();
  }, [id, reload]);

  const rows = useMemo(() => {
    const open = tasks.filter((t) => t.status !== "done");
    const base = members.map((m) => ({
      name: m.displayName || m.email,
      userId: m.userId,
      tasks: open.filter((t) => t.assigneeId === m.userId),
    }));
    const unassigned = open.filter((t) => !t.assigneeId);
    if (unassigned.length > 0) {
      base.push({ name: "Chưa gán", userId: "", tasks: unassigned });
    }
    return base.map((r) => ({
      ...r,
      points: r.tasks.reduce((s, t) => s + (t.storyPoints ?? 0), 0),
    }));
  }, [tasks, members]);

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

          <VStack gap={4} hAlign="stretch" maxWidth={1024}>
            <HStack gap={4} vAlign="center">
              <Heading level={2}>Workload</Heading>
              <StackItem size="fill" />
              <Text type="supporting">Capacity giả định: {CAPACITY} pts</Text>
            </HStack>

            {/* Card ở đây là widget tổng hợp theo người, không phải bọc từng
                record — mỗi thẻ gộp tiến độ + danh sách việc của một người. */}
            {rows.length === 0 ? (
              <EmptyState title="Chưa có thành viên hoặc công việc." />
            ) : (
              rows.map((r) => {
                const over = r.points > CAPACITY;
                return (
                  <Card key={r.userId || "unassigned"} padding={5}>
                    <VStack gap={3} hAlign="stretch">
                      <HStack gap={2} vAlign="center">
                        <Avatar name={r.name} size={32} />
                        <Text weight="medium">{r.name}</Text>
                        <Text type="supporting">{r.tasks.length} việc</Text>
                        <StackItem size="fill" />
                        <Text weight="semibold" hasTabularNumbers color={over ? "accent" : "primary"}>
                          {r.points} / {CAPACITY} pts
                        </Text>
                      </HStack>

                      <ProgressBar
                        label={`Workload ${r.name}`}
                        isLabelHidden
                        value={Math.min(r.points, CAPACITY)}
                        max={CAPACITY}
                        variant={over ? "error" : "accent"}
                      />

                      <HStack gap={1} wrap="wrap">
                        {r.tasks.map((t) => (
                          <Token
                            key={t.id}
                            label={`${t.title}${t.storyPoints ? ` · ${t.storyPoints}` : ""}`}
                            onClick={() => setOpenTask(t.id)}
                          />
                        ))}
                      </HStack>
                    </VStack>
                  </Card>
                );
              })
            )}
          </VStack>
        </VStack>
      </Section>

      {openTask && (
        <TaskDrawer taskId={openTask} onClose={() => setOpenTask(null)} onChanged={reload} />
      )}
    </AppShell>
  );
}
