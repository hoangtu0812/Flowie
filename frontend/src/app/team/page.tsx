"use client";

import { useCallback, useEffect, useState } from "react";
import {
  api,
  APIKey,
  CustomRole,
  Member,
  Team,
  Workspace,
  WorkspaceInvite,
} from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";

const ROLES = ["owner", "admin", "billing", "member", "guest"];
const ROLE_STYLE: Record<string, string> = {
  owner: "bg-primary text-on-primary",
  admin: "bg-primary-fixed text-on-primary-fixed-variant",
  billing: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  member: "bg-surface-container-high text-on-surface-variant",
  guest: "bg-surface-container-high text-on-surface-variant/70",
};

type Tab = "members" | "roles" | "teams" | "apikeys";

export default function TeamPage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [wsId, setWsId] = useState("");
  const [tab, setTab] = useState<Tab>("members");

  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<CustomRole[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [permissions, setPermissions] = useState<string[]>([]);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.listWorkspaces().then((w) => {
      setWorkspaces(w);
      if (w.length > 0) setWsId(w[0].id);
    }).catch(() => {});
    api.listPermissions().then(setPermissions).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!wsId) return;
    api.listMembers(wsId).then(setMembers).catch(() => setMembers([]));
    api.listRoles(wsId).then(setRoles).catch(() => setRoles([]));
    api.listTeams(wsId).then(setTeams).catch(() => setTeams([]));
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

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "members", label: "Thành viên", icon: "group" },
    { key: "roles", label: "Vai trò", icon: "admin_panel_settings" },
    { key: "teams", label: "Phòng ban", icon: "diversity_3" },
    { key: "apikeys", label: "API Keys", icon: "key" },
  ];

  return (
    <AppShell title="Team" actions={actions || undefined}>
      <div className="p-lg max-w-4xl">
        <div className="flex gap-xs border-b border-outline-variant mb-lg">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-xs px-md py-2 text-body-md border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-primary text-primary font-medium"
                  : "border-transparent text-on-surface-variant hover:text-on-surface"
              }`}
            >
              <Icon name={t.icon} size={18} />
              {t.label}
            </button>
          ))}
        </div>

        {tab === "members" && (
          <>
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
                Nếu chưa từng đăng nhập, hãy dùng phần <b>Mời qua email</b> bên dưới.
              </p>
            </form>

            <InvitesCard wsId={wsId} />

            <div className="card overflow-hidden">
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant text-left">
                    <th className="px-md py-2 font-medium">Thành viên</th>
                    <th className="px-md py-2 font-medium">Vai trò</th>
                    <th className="px-md py-2 font-medium">Vai trò tuỳ chỉnh</th>
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
                        <select
                          defaultValue=""
                          onChange={async (e) => {
                            await api.assignCustomRole(wsId, m.userId, e.target.value || null).catch((err) => setError(err.message));
                            load();
                          }}
                          className="text-body-sm border border-outline-variant rounded-md px-2 py-1"
                        >
                          <option value="">— Không —</option>
                          {roles.map((r) => (<option key={r.id} value={r.id}>{r.name}</option>))}
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
                    <tr><td colSpan={4} className="px-md py-xl text-center text-on-surface-variant/60">Chưa có thành viên.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === "roles" && (
          <RolesTab
            wsId={wsId}
            roles={roles}
            permissions={permissions}
            onChanged={load}
            onError={setError}
            error={error}
          />
        )}

        {tab === "apikeys" && <ApiKeysTab wsId={wsId} />}

        {tab === "teams" && (
          <TeamsTab
            wsId={wsId}
            teams={teams}
            members={members}
            onChanged={load}
            onError={setError}
            error={error}
          />
        )}
      </div>
    </AppShell>
  );
}

/** Invite people who have not signed in to Flowie yet. */
function InvitesCard({ wsId }: { wsId: string }) {
  const [invites, setInvites] = useState<WorkspaceInvite[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [link, setLink] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!wsId) return;
    api.listInvites(wsId).then(setInvites).catch(() => setInvites([]));
  }, [wsId]);
  useEffect(() => { load(); }, [load]);

  async function invite() {
    setErr(null);
    try {
      const r = await api.createInvite(wsId, email.trim(), role);
      setLink(r.inviteUrl);
      setEmail("");
      load();
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="card p-lg mb-lg">
      <h3 className="text-headline-md mb-1">Mời qua email</h3>
      <p className="text-body-sm text-on-surface-variant mb-md">
        Tạo liên kết mời cho người chưa từng đăng nhập. Liên kết gắn với đúng email
        được mời và hết hạn sau 14 ngày.
      </p>

      {err && <p className="text-error text-body-sm mb-sm">{err}</p>}

      {link && (
        <div className="mb-md p-md rounded-xl border border-primary/30 bg-primary-container/5">
          <p className="text-body-sm font-semibold text-on-surface mb-1">
            Gửi liên kết này cho người được mời (chỉ hiển thị một lần):
          </p>
          <code className="block text-body-sm bg-surface-container px-2 py-1 rounded break-all">
            {link}
          </code>
        </div>
      )}

      <div className="flex flex-wrap gap-sm items-end mb-md">
        <input
          className="field w-60"
          placeholder="nguoi.moi@congty.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <select className="field w-36" value={role} onChange={(e) => setRole(e.target.value)}>
          {ROLES.filter((r) => r !== "owner").map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
        <button className="btn-primary" onClick={invite} disabled={!email.trim() || !wsId}>
          <Icon name="mail" size={18} /> Tạo lời mời
        </button>
      </div>

      <div className="flex flex-col gap-1">
        {invites.map((i) => (
          <div key={i.id} className="flex items-center gap-sm text-body-sm border border-outline-variant/50 rounded-md px-2 py-1.5">
            <Icon name="mail_outline" size={16} className="text-on-surface-variant" />
            <span className="text-on-surface truncate flex-grow">{i.email}</span>
            <span className="chip bg-surface-container-high text-on-surface-variant">{i.role}</span>
            {i.expired && <span className="chip bg-error-container text-on-error-container">hết hạn</span>}
            <button
              className="p-1 rounded-full hover:bg-red-50 text-red-500"
              title="Huỷ lời mời"
              onClick={async () => {
                await api.revokeInvite(wsId, i.id).catch((e) => setErr(e.message));
                load();
              }}
            >
              <Icon name="close" size={16} />
            </button>
          </div>
        ))}
        {invites.length === 0 && (
          <p className="text-body-sm text-on-surface-variant/60">Không có lời mời đang chờ.</p>
        )}
      </div>
    </div>
  );
}

/** Issue and revoke workspace API keys for the public API. */
function ApiKeysTab({ wsId }: { wsId: string }) {
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [name, setName] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [secret, setSecret] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!wsId) return;
    api.listApiKeys(wsId).then(setKeys).catch(() => setKeys([]));
  }, [wsId]);
  useEffect(() => { load(); }, [load]);

  async function create() {
    setErr(null);
    try {
      const scopes = canWrite ? ["read", "write"] : ["read"];
      const r = await api.createApiKey(wsId, name.trim(), scopes);
      setSecret(r.secret);
      setName("");
      load();
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <>
      <div className="card p-lg mb-lg">
        <h3 className="text-headline-md mb-1">API Keys</h3>
        <p className="text-body-sm text-on-surface-variant mb-md">
          Dùng cho tích hợp bên thứ ba qua <code>/api/public/v1</code>. Gửi header{" "}
          <code>Authorization: Bearer &lt;key&gt;</code>.
        </p>

        {err && <p className="text-error text-body-sm mb-sm">{err}</p>}

        {secret && (
          <div className="mb-md p-md rounded-xl border border-primary/30 bg-primary-container/5">
            <p className="text-body-sm font-semibold text-on-surface mb-1">
              Sao chép key ngay — key chỉ hiển thị một lần:
            </p>
            <code className="block text-body-sm bg-surface-container px-2 py-1 rounded break-all">
              {secret}
            </code>
          </div>
        )}

        <div className="flex flex-wrap gap-sm items-end">
          <input
            className="field w-56"
            placeholder="Tên key (VD: CI bot)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="flex items-center gap-2 text-body-sm cursor-pointer">
            <input type="checkbox" className="accent-primary" checked={canWrite} onChange={(e) => setCanWrite(e.target.checked)} />
            Cho phép ghi (write)
          </label>
          <button className="btn-primary" onClick={create} disabled={!name.trim() || !wsId}>
            <Icon name="key" size={18} /> Tạo key
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-sm">
        {keys.map((k) => (
          <div key={k.id} className="card p-md flex flex-wrap items-center gap-sm">
            <span className="font-semibold text-on-surface">{k.name}</span>
            <code className="text-body-sm text-on-surface-variant">{k.prefix}…</code>
            {k.scopes.map((s) => (
              <span key={s} className="chip bg-primary-container/10 text-primary">{s}</span>
            ))}
            <span className={`chip ${k.active ? "bg-success-container text-success" : "bg-surface-container-highest text-on-surface-variant"}`}>
              {k.active ? "đang dùng" : "đã thu hồi"}
            </span>
            <span className="text-body-sm text-on-surface-variant/60">
              {k.lastUsedAt ? `dùng lần cuối ${new Date(k.lastUsedAt).toLocaleString()}` : "chưa dùng"}
            </span>
            {k.active && (
              <button
                className="ml-auto p-2 rounded-full hover:bg-red-50 text-red-500"
                title="Thu hồi"
                onClick={async () => {
                  if (!window.confirm(`Thu hồi key "${k.name}"? Ứng dụng đang dùng key này sẽ mất quyền truy cập.`)) return;
                  await api.revokeApiKey(wsId, k.id).catch((e) => setErr(e.message));
                  load();
                }}
              >
                <Icon name="block" size={18} />
              </button>
            )}
          </div>
        ))}
        {keys.length === 0 && (
          <div className="card p-xl text-center text-on-surface-variant/60">Chưa có API key nào.</div>
        )}
      </div>
    </>
  );
}

function RolesTab({
  wsId, roles, permissions, onChanged, onError, error,
}: {
  wsId: string;
  roles: CustomRole[];
  permissions: string[];
  onChanged: () => void;
  onError: (e: string | null) => void;
  error: string | null;
}) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [editing, setEditing] = useState<string | null>(null);

  function toggle(p: string) {
    setPicked((prev) => (prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]));
  }

  async function save() {
    onError(null);
    if (!name.trim()) return;
    try {
      if (editing) await api.updateRole(wsId, editing, name.trim(), picked);
      else await api.createRole(wsId, name.trim(), picked);
      setName(""); setPicked([]); setEditing(null);
      onChanged();
    } catch (err) {
      onError((err as Error).message);
    }
  }

  return (
    <>
      <div className="card p-lg mb-lg">
        <h3 className="text-headline-md mb-md">{editing ? "Sửa vai trò" : "Tạo vai trò tuỳ chỉnh"}</h3>
        <input
          className="field mb-md"
          placeholder="Tên vai trò (VD: QA Tester)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="text-label-md text-on-surface-variant mb-sm">Quyền hạn</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mb-md">
          {permissions.map((p) => (
            <label key={p} className="flex items-center gap-2 text-body-sm cursor-pointer hover:bg-surface-container-low rounded px-2 py-1">
              <input type="checkbox" className="accent-primary" checked={picked.includes(p)} onChange={() => toggle(p)} />
              <span className="truncate">{p}</span>
            </label>
          ))}
        </div>
        {error && <p className="text-error text-body-sm mb-sm">{error}</p>}
        <div className="flex gap-sm">
          <button className="btn-primary" onClick={save} disabled={!name.trim() || !wsId}>
            <Icon name={editing ? "save" : "add"} size={18} /> {editing ? "Lưu" : "Tạo vai trò"}
          </button>
          {editing && (
            <button className="btn-ghost" onClick={() => { setEditing(null); setName(""); setPicked([]); }}>Huỷ</button>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-sm">
        {roles.map((r) => (
          <div key={r.id} className="card p-md flex items-start justify-between gap-md">
            <div className="min-w-0">
              <p className="text-on-surface font-semibold">{r.name}</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {r.permissions.length === 0 && <span className="text-body-sm text-on-surface-variant/60">Chưa có quyền nào</span>}
                {r.permissions.map((p) => (
                  <span key={p} className="chip bg-primary-container/10 text-primary">{p}</span>
                ))}
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
              <button
                className="p-2 rounded-full hover:bg-surface-container text-on-surface-variant"
                title="Sửa"
                onClick={() => { setEditing(r.id); setName(r.name); setPicked(r.permissions); }}
              >
                <Icon name="edit" size={18} />
              </button>
              <button
                className="p-2 rounded-full hover:bg-red-50 text-red-500"
                title="Xoá"
                onClick={async () => {
                  if (!window.confirm(`Xoá vai trò "${r.name}"?`)) return;
                  await api.deleteRole(wsId, r.id).catch((e) => onError(e.message));
                  onChanged();
                }}
              >
                <Icon name="delete" size={18} />
              </button>
            </div>
          </div>
        ))}
        {roles.length === 0 && (
          <div className="card p-xl text-center text-on-surface-variant/60">Chưa có vai trò tuỳ chỉnh nào.</div>
        )}
      </div>
    </>
  );
}

function TeamsTab({
  wsId, teams, members, onChanged, onError, error,
}: {
  wsId: string;
  teams: Team[];
  members: Member[];
  onChanged: () => void;
  onError: (e: string | null) => void;
  error: string | null;
}) {
  const [name, setName] = useState("");

  return (
    <>
      <div className="card p-lg mb-lg">
        <h3 className="text-headline-md mb-md">Tạo phòng ban</h3>
        <div className="flex gap-sm">
          <input
            className="field flex-grow"
            placeholder="Tên phòng ban (VD: Marketing)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            className="btn-primary"
            disabled={!name.trim() || !wsId}
            onClick={async () => {
              onError(null);
              try {
                await api.createTeam(wsId, name.trim());
                setName("");
                onChanged();
              } catch (err) {
                onError((err as Error).message);
              }
            }}
          >
            <Icon name="add" size={18} /> Tạo
          </button>
        </div>
        {error && <p className="text-error text-body-sm mt-sm">{error}</p>}
      </div>

      <div className="flex flex-col gap-md">
        {teams.map((t) => {
          const memberIds = new Set(t.members.map((m) => m.userId));
          return (
            <div key={t.id} className="card p-md">
              <div className="flex items-center justify-between mb-sm">
                <p className="text-on-surface font-semibold">
                  {t.name} <span className="text-on-surface-variant/60 font-normal">({t.members.length})</span>
                </p>
                <button
                  className="p-2 rounded-full hover:bg-red-50 text-red-500"
                  title="Xoá phòng ban"
                  onClick={async () => {
                    if (!window.confirm(`Xoá phòng ban "${t.name}"?`)) return;
                    await api.deleteTeam(wsId, t.id).catch((e) => onError(e.message));
                    onChanged();
                  }}
                >
                  <Icon name="delete" size={18} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {members.map((m) => (
                  <label key={m.userId} className="flex items-center gap-2 text-body-sm cursor-pointer hover:bg-surface-container-low rounded px-2 py-1">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={memberIds.has(m.userId)}
                      onChange={async (e) => {
                        await api.setTeamMember(wsId, t.id, m.userId, e.target.checked).catch((err) => onError(err.message));
                        onChanged();
                      }}
                    />
                    <span className="truncate">{m.displayName || m.email}</span>
                  </label>
                ))}
                {members.length === 0 && (
                  <span className="text-body-sm text-on-surface-variant/60">Chưa có thành viên trong workspace.</span>
                )}
              </div>
            </div>
          );
        })}
        {teams.length === 0 && (
          <div className="card p-xl text-center text-on-surface-variant/60">Chưa có phòng ban nào.</div>
        )}
      </div>
    </>
  );
}
