"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, AutomationRule, Member, Project } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import ProjectTabs from "@/components/layout/ProjectTabs";
import { STATUSES } from "@/lib/status";

export default function AutomationsPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState({ triggerStatus: "in_review", assigneeId: "", name: "" });
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listAutomations(id).then(setRules).catch(() => setRules([]));
  }, [id]);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    api.projectMembers(id).then((m) => {
      setMembers(m);
      if (m.length > 0) setForm((f) => ({ ...f, assigneeId: m[0].userId }));
    }).catch(() => {});
    load();
  }, [id, load]);

  const memberName = (uid?: string) => members.find((m) => m.userId === uid)?.displayName || "—";
  const statusLabel = (k: string) => STATUSES.find((s) => s.key === k)?.label || k;

  async function create(e: React.FormEvent) {
    e.preventDefault();
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
        <div className="flex items-center gap-sm">
          {project && <span className="chip bg-primary-container/10 text-primary">{project.key}</span>}
          <span>{project?.name || "Project"}</span>
        </div>
      }
    >
      <div className="p-lg max-w-3xl">
        {project && <ProjectTabs projectId={id} />}
        <h2 className="text-headline-md mb-md">Automation</h2>
        <p className="text-body-sm text-on-surface-variant mb-lg">
          Quy tắc <b>Trigger → Action</b>: khi task chuyển sang một trạng thái, tự động gán cho người phụ trách (và gửi thông báo).
        </p>

        <form onSubmit={create} className="card p-lg mb-lg">
          <div className="flex flex-wrap items-end gap-sm">
            <div>
              <label className="text-label-md text-on-surface-variant">Khi status →</label>
              <select className="field mt-1 w-40" value={form.triggerStatus} onChange={(e) => setForm({ ...form, triggerStatus: e.target.value })}>
                {STATUSES.map((s) => (<option key={s.key} value={s.key}>{s.label}</option>))}
              </select>
            </div>
            <div>
              <label className="text-label-md text-on-surface-variant">Gán cho</label>
              <select className="field mt-1 w-48" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
                {members.map((m) => (<option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>))}
              </select>
            </div>
            <button className="btn-primary" disabled={!form.assigneeId}>
              <Icon name="add" size={18} /> Thêm quy tắc
            </button>
          </div>
          {error && <p className="text-error text-body-sm mt-sm">{error}</p>}
        </form>

        <div className="flex flex-col gap-sm">
          {rules.map((r) => (
            <div key={r.id} className="card p-md flex items-center justify-between">
              <div className="flex items-center gap-sm text-body-md">
                <Icon name="bolt" size={18} className="text-primary" />
                <span>Khi status →</span>
                <span className="chip bg-primary-fixed text-on-primary-fixed-variant">{statusLabel(r.triggerStatus)}</span>
                <Icon name="arrow_forward" size={16} className="text-on-surface-variant" />
                <span>gán cho</span>
                <span className="font-medium">{memberName(r.actionAssigneeId)}</span>
              </div>
              <button className="text-on-surface-variant hover:text-error" onClick={async () => { await api.deleteAutomation(r.id).catch(() => {}); load(); }}>
                <Icon name="delete" size={18} />
              </button>
            </div>
          ))}
          {rules.length === 0 && (
            <div className="card p-xl text-center text-on-surface-variant">Chưa có quy tắc nào.</div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
