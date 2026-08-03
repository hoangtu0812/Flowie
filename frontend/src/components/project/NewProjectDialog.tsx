"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { FormLayout } from "@astryxdesign/core/FormLayout";
import { TextInput } from "@astryxdesign/core/TextInput";
import { TextArea } from "@astryxdesign/core/TextArea";
import { Button } from "@astryxdesign/core/Button";
import { Section } from "@astryxdesign/core/Section";
import { VStack, HStack } from "@astryxdesign/core/Layout";
import { api, Project } from "@/lib/api";

/**
 * Project creation modal.
 *
 * Previously this form only existed inside the workspace detail page, so the
 * dashboard and the project list had no way to create anything. Extracted so
 * every "new project" entry point opens the same dialog.
 */
export default function NewProjectDialog({
  workspaceId,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  onClose: () => void;
  /** Called after a successful create; omit to navigate into the new project. */
  onCreated?: (p: Project) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The key is derivable from the name in almost every case, so suggest it and
  // stop suggesting as soon as the user edits it themselves.
  function onName(v: string) {
    setName(v);
    if (!keyTouched) setKey(suggestKey(v));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const p = await api.createProject(workspaceId, {
        name: name.trim(),
        key: key.trim().toUpperCase(),
        description: description.trim(),
      });
      if (onCreated) onCreated(p);
      else router.push(`/projects/${p.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const canSubmit = !busy && !!name.trim() && !!key.trim();

  return (
    <Dialog isOpen onOpenChange={(open) => { if (!open) onClose(); }} purpose="form" width={480}>
      <DialogHeader title="Tạo dự án" onOpenChange={(open) => { if (!open) onClose(); }} />
      <VStack gap={4} hAlign="stretch">
        <Section variant="transparent" padding={4}>
          <FormLayout>
          <TextInput
            label="Tên dự án"
            placeholder="Website Revamp"
            value={name}
            onChange={onName}
            hasAutoFocus
          />
          <TextInput
            label="Mã (KEY)"
            placeholder="WEB"
            value={key}
            onChange={(v) => {
              setKeyTouched(true);
              setKey(v);
            }}
            description={`Dùng làm tiền tố mã công việc, ví dụ ${key.trim().toUpperCase() || "WEB"}-12.`}
            status={error ? { type: "error", message: error } : undefined}
          />
          <TextArea
            label="Mô tả"
            placeholder="Tuỳ chọn"
            value={description}
            onChange={setDescription}
            isOptional
            rows={3}
          />
          </FormLayout>
        </Section>
        <Section variant="transparent" padding={4} dividers={["top"]}>
          <HStack gap={2} justify="end">
            <Button label="Huỷ" variant="ghost" onClick={onClose} />
            <Button
              label={busy ? "Đang tạo…" : "Tạo dự án"}
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

/** "Website Revamp" → "WR"; single word → first 3 letters. */
function suggestKey(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 4).map((w) => w[0]).join("").toUpperCase();
}
