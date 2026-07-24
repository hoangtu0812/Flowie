"use client";

import { useCallback, useEffect, useState } from "react";
import { api, Member, Workspace } from "@/lib/api";
import AppShell from "@/components/AppShell";
import Icon from "@/components/Icon";

const ROLES = ["owner", "admin", "billing", "member", "guest"];
const ROLE_STYLE: Record<string, string> = {
  owner: "bg-primary text-on-primary",
  admin: "bg-primary-fixed text-on-primary-fixed-variant",
  billing: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  member: "bg-surface-container-high text-on-surface-variant",
  guest: "bg-surface-container-high text-on-surface-variant/70",
};

export default function TeamPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [wsId, setWsId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listWorkspaces().then((w) => {
      setWorkspaces(w);
      if (w.length > 0) setWsId(w[0].id);
    }).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (wsId) api.listMembers(wsId).then(setMembers).catch(() => setMembers([]));
  }, [wsId]);
  useEffect(() => { load(); }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.addMember(wsId, email.trim(), role);
      setEmail("");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const actions = workspaces.length > 0 && (
    <select className="field w-auto" value={wsId} onChange={(e) => setWsId(e.target.value)}>
      {workspaces.map((w) => (<option key={w.id} value={w.id}>{w.name}</option>))}
    </select>
  );

  return (
    <AppShell title="Team" actions={actions || undefined}>
      <div className="p-lg max-w-4xl">
        <form onSubmit={invite} className="card p-lg mb-lg">
          <h3 className="text-headline-md mb-md">Thêm thành viên</h3>
          <div className="flex flex-wrap gap-sm items-end">
            <div className="flex-grow min-w-60">
              <label className="text-label-md text-on-surface-variant">Email (người đã từng đăng nhập)</label>
              <input className="field mt-1" placeholder="user@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="text-label-md text-on-surface-variant">Vai trò</label>
              <select className="field mt-1 w-36" value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (<option key={r} value={r}>{r}</option>))}
              </select>
            </div>
            <button className="btn-primary" disabled={!email.trim() || !wsId}>
              <Icon name="person_add" size={18} /> Thêm
            </button>
          </div>
          {error && <p className="text-error text-body-sm mt-sm">{error}</p>}
          <p className="text-body-sm text-on-surface-variant/70 mt-sm">
            Người dùng phải đăng nhập Flowie ít nhất một lần (qua Azure AD) để có thể được thêm.
          </p>
        </form>

        <div className="card overflow-hidden">
          <table className="w-full text-body-sm">
            <thead>
              <tr className="bg-surface-container-low text-on-surface-variant text-left">
                <th className="px-md py-2 font-medium">Thành viên</th>
                <th className="px-md py-2 font-medium">Vai trò</th>
                <th className="px-md py-2 font-medium">Rate (/giờ)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {members.map((m) => (
                <tr key={m.userId} className="hover:bg-surface-container-low">
                  <td className="px-md py-2">
                    <div className="flex items-center gap-sm">
                      <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center text-label-sm">
                        {(m.displayName || m.email).slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-on-surface font-medium">{m.displayName || "—"}</p>
                        <p className="text-on-surface-variant/70">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-md py-2">
                    <select
                      value={m.role}
                      onChange={async (e) => { await api.updateMember(wsId, m.userId, e.target.value).catch(() => {}); load(); }}
                      className={`chip ${ROLE_STYLE[m.role] ?? ""} border-0 outline-none`}
                    >
                      {ROLES.map((r) => (<option key={r} value={r}>{r}</option>))}
                    </select>
                  </td>
                  <td className="px-md py-2">
                    <div className="flex items-center gap-1">
                      <span className="text-on-surface-variant">{m.currency}</span>
                      <input
                        type="number"
                        min={0}
                        defaultValue={m.hourlyRate}
                        onBlur={async (e) => {
                          const v = Number(e.target.value);
                          if (v !== m.hourlyRate) { await api.setMemberRate(wsId, m.userId, v, m.currency).catch(() => {}); load(); }
                        }}
                        className="w-24 bg-transparent border border-outline-variant rounded-md px-2 py-1"
                      />
                    </div>
                  </td>
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan={3} className="px-md py-xl text-center text-on-surface-variant/60">Chưa có thành viên.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
