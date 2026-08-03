"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Section } from "@astryxdesign/core/Section";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Selector } from "@astryxdesign/core/Selector";
import { DateInput } from "@astryxdesign/core/DateInput";

/** Kiểu ngày Astryx yêu cầu: chuỗi "YYYY-MM-DD" ở mức template literal. */
type DateValue = `${number}${number}${number}${number}-${number}${number}-${number}${number}`;
import { Button } from "@astryxdesign/core/Button";
import { api, Member, Project } from "@/lib/api";
import { PRIORITIES } from "@/lib/status";

/**
 * Workspace-level task creation.
 *
 * The board can only add a task to the column you're looking at, so there was
 * no way to capture work from the dashboard. This picks the project first.
 */
export default function NewTaskDialog({
  workspaceId,
  defaultProjectId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  defaultProjectId?: string;
  onClose: () => void;
  /** Omit to navigate to the project board after creating. */
  onCreated?: () => void;
}) {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assigneeId, setAssigneeId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listProjects(workspaceId)
      .then((ps) => {
        setProjects(ps);
        setProjectId((cur) => cur || ps[0]?.id || "");
      })
      .catch(() => {});
    api.listMembers(workspaceId).then(setMembers).catch(() => setMembers([]));
  }, [workspaceId]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const t = await api.createTask(projectId, {
        title: title.trim(),
        priority,
        assigneeId: assigneeId || undefined,
      });
      // Due date isn't part of the create payload, so patch it afterwards.
      if (dueDate) await api.updateTask(t.id, { dueDate });
      if (onCreated) onCreated();
      else router.push(`/projects/${projectId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const close = (open: boolean) => {
    if (!open) onClose();
  };
  const canSubmit = !busy && !!title.trim() && !!projectId;

  return (
    <Dialog isOpen onOpenChange={close} purpose="form" width={480}>
      <DialogHeader title="Công việc mới" onOpenChange={close} />
      <VStack gap={0} hAlign="stretch">
        <Section variant="transparent" padding={4}>
          <FormLayout>
            <Selector
              label="Dự án"
              value={projectId}
              onChange={setProjectId}
              placeholder={projects.length === 0 ? "Chưa có dự án nào" : "Chọn dự án"}
              options={projects.map((p) => ({ value: p.id, label: `${p.key} · ${p.name}` }))}
            />
            <TextInput
              label="Tiêu đề"
              placeholder="Rà soát bản thiết kế trang chủ"
              value={title}
              onChange={setTitle}
              hasAutoFocus
              status={error ? { type: "error", message: error } : undefined}
            />
            <Grid columns={2} gap={4}>
              <Selector
                label="Độ ưu tiên"
                value={priority}
                onChange={setPriority}
                options={Object.entries(PRIORITIES).map(([key, p]) => ({
                  value: key,
                  label: p.label,
                }))}
              />
              {/* DateInput gõ kiểu chặt theo mẫu "YYYY-MM-DD"; state ở đây là
                  string thường vì API nhận string, nên ép kiểu ở ranh giới. */}
              <DateInput
                label="Hạn chót"
                value={(dueDate || undefined) as DateValue | undefined}
                onChange={(v) => setDueDate(v ?? "")}
                isOptional
              />
            </Grid>
            <Selector
              label="Người thực hiện"
              value={assigneeId}
              onChange={(v) => setAssigneeId(v ?? "")}
              placeholder="Chưa giao"
              hasClear
              options={members.map((m) => ({
                value: m.userId,
                label: m.displayName || m.email,
              }))}
            />
          </FormLayout>
        </Section>
        <Section variant="transparent" padding={4} dividers={["top"]}>
          <HStack gap={2} justify="end">
            <Button label="Huỷ" variant="ghost" onClick={onClose} />
            <Button
              label={busy ? "Đang tạo…" : "Tạo công việc"}
              variant="primary"
              isLoading={busy}
              isDisabled={!canSubmit}
              clickAction={submit}
            />
          </HStack>
        </Section>
      </VStack>
    </Dialog>
  );
}
