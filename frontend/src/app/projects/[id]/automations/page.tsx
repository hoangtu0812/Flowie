"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
    api.projectMembers(id).then((m) => {
      setMembers(m);
      if (m.length > 0) setForm((f) => ({ ...f, assigneeId: m[0].userId }));
    }).catch(() => {});
    api.listStatuses(id).then((ss) => {
      const defs = toStatusDefs(ss);
      setStatusDefs(defs);
      // Default the trigger to a real column of this project.
      setForm((f) => (defs.some((d) => d.key === f.triggerStatus)
        ? f
        : { ...f, triggerStatus: defs[0]?.key ?? f.triggerStatus }));
    }).catch(() => {});
    load();
  }, [id, load]);

  const memberName = (uid?: string) => members.find((m) => m.userId === uid)?.displayName || "—";
  const statusLabel = (k: string) => statusDefs.find((s) => s.key === k)?.label || k;

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
      <div className="p-lg">
        {project && <ProjectTabs projectId={id} />}
        <div className="max-w-3xl">
          <h2 className="text-headline-md mb-md">Automation</h2>
          <p className="text-body-sm text-on-surface-variant mb-lg">
            Quy tắc <b>Trigger → Action</b>: khi task chuyển sang một trạng thái, tự động gán cho người phụ trách (và gửi thông báo).
          </p>

          <form onSubmit={create} className="card p-lg mb-lg">
            <div className="flex flex-wrap items-end gap-sm">
              <div>
                <label className="text-label-md text-on-surface-variant">Khi status →</label>
                <select className="field mt-1 w-40" value={form.triggerStatus} onChange={(e) => setForm({ ...form, triggerStatus: e.target.value })}>
                  {statusDefs.map((s) => (<option key={s.key} value={s.key}>{s.label}</option>))}
                </select>
              </div>
              <span className="text-body-lg text-on-surface-variant mb-2">tự động gán cho</span>
              <div>
                <label className="text-label-md text-on-surface-variant">Thành viên</label>
                <select className="field mt-1 w-48" value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
                  <option value="">-- Chọn --</option>
                  {members.map((m) => (<option key={m.userId} value={m.userId}>{m.displayName || m.email}</option>))}
                </select>
              </div>
              <button className="btn-primary" type="submit" disabled={!form.assigneeId}>
                <Icon name="add" size={18} /> Thêm rule
              </button>
            </div>
          </form>

          <div className="flex flex-col gap-sm">
            {rules.map((r) => (
              <div key={r.id} className="card p-md flex items-center justify-between">
                <div className="flex items-center gap-sm">
                  <span className="chip bg-secondary-container text-on-secondary-container">{statusLabel(r.triggerStatus)}</span>
                  <span className="text-body-sm text-on-surface-variant">→ Gán cho</span>
                  <span className="text-body-sm font-medium text-on-surface">{memberName(r.actionAssigneeId)}</span>
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
      </div>
    </AppShell>
  );
}
