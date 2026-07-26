"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-md"
      onClick={onClose}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="card shadow-modal p-lg w-full max-w-md"
      >
        <h3 className="text-headline-lg text-on-surface mb-md">Tạo dự án</h3>

        <label className="block text-label-md text-on-surface-variant mb-1">Tên dự án</label>
        <input
          className="field mb-md"
          placeholder="Website Revamp"
          value={name}
          onChange={(e) => onName(e.target.value)}
          autoFocus
        />

        <label className="block text-label-md text-on-surface-variant mb-1">Mã (KEY)</label>
        <input
          className="field mb-1 uppercase"
          placeholder="WEB"
          value={key}
          maxLength={10}
          onChange={(e) => { setKeyTouched(true); setKey(e.target.value); }}
        />
        <p className="text-body-sm text-on-surface-variant/70 mb-md">
          Dùng làm tiền tố mã công việc, ví dụ {key.trim().toUpperCase() || "WEB"}-12.
        </p>

        <label className="block text-label-md text-on-surface-variant mb-1">Mô tả</label>
        <textarea
          className="field mb-lg"
          rows={3}
          placeholder="Tuỳ chọn"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        {error && <p className="text-error text-body-sm mb-md">{error}</p>}

        <div className="flex justify-end gap-sm">
          <button type="button" className="btn-ghost" onClick={onClose}>Huỷ</button>
          <button className="btn-primary" disabled={busy || !name.trim() || !key.trim()}>
            {busy ? "Đang tạo…" : "Tạo dự án"}
          </button>
        </div>
      </form>
    </div>
  );
}

/** "Website Revamp" → "WR"; single word → first 3 letters. */
function suggestKey(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 4).map((w) => w[0]).join("").toUpperCase();
}
