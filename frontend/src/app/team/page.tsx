"use client";

import { useCallback, useEffect, useState } from "react";
import { Section } from "@astryxdesign/core/Section";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { List, ListItem } from "@astryxdesign/core/List";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import { TabList, Tab as TabItem } from "@astryxdesign/core/TabList";
import { TextInput } from "@astryxdesign/core/TextInput";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Token } from "@astryxdesign/core/Token";
import { Code } from "@astryxdesign/core/Code";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { EmptyState } from "@astryxdesign/core/EmptyState";
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

type Tab = "members" | "roles" | "teams" | "apikeys";

interface MemberRow extends Record<string, unknown> {
  userId: string;
  displayName: string;
  email: string;
  role: string;
  currency: string;
  hourlyRate: number;
}

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
    api
      .listWorkspaces()
      .then((w) => {
        setWorkspaces(w);
        if (w.length > 0) setWsId(w[0].id);
      })
      .catch(() => {});
    api.listPermissions().then(setPermissions).catch(() => {});
  }, []);

  const load = useCallback(() => {
    if (!wsId) return;
    api.listMembers(wsId).then(setMembers).catch(() => setMembers([]));
    api.listRoles(wsId).then(setRoles).catch(() => setRoles([]));
    api.listTeams(wsId).then(setTeams).catch(() => setTeams([]));
  }, [wsId]);
  useEffect(() => {
    load();
  }, [load]);

  async function invite() {
    setError(null);
    try {
      await api.addMember(wsId, email.trim(), role);
      setEmail("");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const actions =
    workspaces.length > 0 ? (
      <Selector
        label="Không gian làm việc"
        isLabelHidden
        size="sm"
        value={wsId}
        onChange={(v) => setWsId(v ?? "")}
        options={workspaces.map((w) => ({ value: w.id, label: w.name }))}
      />
    ) : undefined;

  const TABS: { key: Tab; label: string; icon: string }[] = [
    { key: "members", label: "Thành viên", icon: "group" },
    { key: "roles", label: "Vai trò", icon: "admin_panel_settings" },
    { key: "teams", label: "Phòng ban", icon: "diversity_3" },
    { key: "apikeys", label: "API Keys", icon: "key" },
  ];

  const memberRows: MemberRow[] = members.map((m) => ({
    userId: m.userId,
    displayName: m.displayName || "—",
    email: m.email,
    role: m.role,
    currency: m.currency,
    hourlyRate: m.hourlyRate,
  }));

  return (
    <AppShell title="Team" actions={actions}>
      <Section variant="transparent" padding={5} maxWidth={896}>
        <VStack gap={5} hAlign="stretch">
          <TabList value={tab} onChange={(v) => setTab(v as Tab)} hasDivider>
            {TABS.map((t) => (
              <TabItem
                key={t.key}
                value={t.key}
                label={t.label}
                icon={<Icon name={t.icon} size={18} />}
              />
            ))}
          </TabList>

          {tab === "members" && (
            <>
              <Card padding={5}>
                <VStack gap={3} hAlign="stretch">
                  <Heading level={3}>Thêm thành viên</Heading>
                  <HStack gap={3} vAlign="end" wrap="wrap">
                    <StackItem size="fill">
                      <TextInput
                        label="Email (người đã từng đăng nhập)"
                        placeholder="user@company.com"
                        value={email}
                        onChange={setEmail}
                        status={error ? { type: "error", message: error } : undefined}
                      />
                    </StackItem>
                    <Selector
                      label="Vai trò"
                      value={role}
                      onChange={(v) => setRole(v ?? "member")}
                      options={ROLES.map((r) => ({ value: r, label: r }))}
                    />
                    <Button
                      label="Thêm"
                      variant="primary"
                      icon={<Icon name="person_add" size={18} />}
                      isDisabled={!email.trim() || !wsId}
                      clickAction={invite}
                    />
                  </HStack>
                  <Text type="supporting">
                    Người dùng phải đăng nhập Flowie ít nhất một lần (qua Azure AD) để có thể được
                    thêm. Nếu chưa từng đăng nhập, hãy dùng phần Mời qua email bên dưới.
                  </Text>
                </VStack>
              </Card>

              <InvitesCard wsId={wsId} />

              <Card padding={0}>
                {memberRows.length === 0 ? (
                  <EmptyState title="Chưa có thành viên." />
                ) : (
                  // Dữ liệu cột dày → Table, không bọc từng dòng trong Card.
                  <Table<MemberRow>
                    data={memberRows}
                    idKey="userId"
                    density="compact"
                    hasHover
                    columns={[
                      {
                        key: "displayName",
                        header: "Thành viên",
                        width: proportional(1.5),
                        renderCell: (m) => (
                          <HStack gap={3} vAlign="center">
                            <Avatar name={m.displayName || m.email} size={32} tooltip={false} />
                            <VStack gap={0}>
                              <Text weight="medium" maxLines={1}>
                                {m.displayName}
                              </Text>
                              <Text type="supporting" maxLines={1}>
                                {m.email}
                              </Text>
                            </VStack>
                          </HStack>
                        ),
                      },
                      {
                        key: "role",
                        header: "Vai trò",
                        width: pixel(140),
                        renderCell: (m) => (
                          <Selector
                            label="Vai trò"
                            isLabelHidden
                            size="sm"
                            value={m.role}
                            onChange={async (v) => {
                              await api.updateMember(wsId, m.userId, v ?? "member").catch(() => {});
                              load();
                            }}
                            options={ROLES.map((r) => ({ value: r, label: r }))}
                          />
                        ),
                      },
                      {
                        key: "customRole",
                        header: "Vai trò tuỳ chỉnh",
                        width: pixel(170),
                        renderCell: (m) => (
                          <Selector
                            label="Vai trò tuỳ chỉnh"
                            isLabelHidden
                            size="sm"
                            value=""
                            placeholder="— Không —"
                            onChange={async (v) => {
                              await api
                                .assignCustomRole(wsId, m.userId, v || null)
                                .catch((err) => setError(err.message));
                              load();
                            }}
                            options={[
                              { value: "", label: "— Không —" },
                              ...roles.map((r) => ({ value: r.id, label: r.name })),
                            ]}
                          />
                        ),
                      },
                      {
                        key: "hourlyRate",
                        header: "Rate (/giờ)",
                        width: pixel(150),
                        renderCell: (m) => (
                          <HStack gap={1} vAlign="center">
                            <Text type="supporting">{m.currency}</Text>
                            <NumberInput
                              label="Rate theo giờ"
                              isLabelHidden
                              size="sm"
                              width={96}
                              min={0}
                              value={m.hourlyRate}
                              onChange={async (v) => {
                                if (v != null && v !== m.hourlyRate) {
                                  await api
                                    .setMemberRate(wsId, m.userId, v, m.currency)
                                    .catch(() => {});
                                  load();
                                }
                              }}
                            />
                          </HStack>
                        ),
                      },
                    ]}
                  />
                )}
              </Card>
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
        </VStack>
      </Section>
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
  useEffect(() => {
    load();
  }, [load]);

  async function invite() {
    setErr(null);
    try {
      const r = await api.createInvite(wsId, email.trim(), role);
      setLink(r.inviteUrl);
      setEmail("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <Card padding={5}>
      <VStack gap={4} hAlign="stretch">
        <VStack gap={1}>
          <Heading level={3}>Mời qua email</Heading>
          <Text type="supporting">
            Tạo liên kết mời cho người chưa từng đăng nhập. Liên kết gắn với đúng email được mời
            và hết hạn sau 14 ngày.
          </Text>
        </VStack>

        {err && <Banner status="error" title={err} isDismissable onDismiss={() => setErr(null)} />}

        {link && (
          <Card variant="blue" padding={4}>
            <VStack gap={1} hAlign="stretch">
              <Text weight="semibold">
                Gửi liên kết này cho người được mời (chỉ hiển thị một lần):
              </Text>
              <Code>{link}</Code>
            </VStack>
          </Card>
        )}

        <HStack gap={3} vAlign="end" wrap="wrap">
          <StackItem size="fill">
            <TextInput
              label="Email người được mời"
              placeholder="nguoi.moi@congty.com"
              value={email}
              onChange={setEmail}
            />
          </StackItem>
          <Selector
            label="Vai trò"
            value={role}
            onChange={(v) => setRole(v ?? "member")}
            options={ROLES.filter((r) => r !== "owner").map((r) => ({ value: r, label: r }))}
          />
          <Button
            label="Tạo lời mời"
            variant="primary"
            icon={<Icon name="mail" size={18} />}
            isDisabled={!email.trim() || !wsId}
            clickAction={invite}
          />
        </HStack>

        {invites.length === 0 ? (
          <Text type="supporting">Không có lời mời đang chờ.</Text>
        ) : (
          <List hasDividers>
            {invites.map((i) => (
              <ListItem
                key={i.id}
                startContent={<Icon name="mail_outline" size={16} />}
                label={i.email}
                endContent={
                  <HStack gap={2} vAlign="center">
                    <Badge label={i.role} />
                    {i.expired && <Badge variant="error" label="hết hạn" />}
                    <IconButton
                      label="Huỷ lời mời"
                      tooltip="Huỷ lời mời"
                      variant="ghost"
                      size="sm"
                      icon={<Icon name="close" size={16} />}
                      clickAction={async () => {
                        await api.revokeInvite(wsId, i.id).catch((e) => setErr(e.message));
                        load();
                      }}
                    />
                  </HStack>
                }
              />
            ))}
          </List>
        )}
      </VStack>
    </Card>
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
  useEffect(() => {
    load();
  }, [load]);

  async function create() {
    setErr(null);
    try {
      const scopes = canWrite ? ["read", "write"] : ["read"];
      const r = await api.createApiKey(wsId, name.trim(), scopes);
      setSecret(r.secret);
      setName("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <VStack gap={5} hAlign="stretch">
      <Card padding={5}>
        <VStack gap={4} hAlign="stretch">
          <VStack gap={1}>
            <Heading level={3}>API Keys</Heading>
            <Text type="supporting">
              Dùng cho tích hợp bên thứ ba qua <Code>/api/public/v1</Code>. Gửi header{" "}
              <Code>Authorization: Bearer &lt;key&gt;</Code>.
            </Text>
          </VStack>

          {err && <Banner status="error" title={err} isDismissable onDismiss={() => setErr(null)} />}

          {secret && (
            <Card variant="blue" padding={4}>
              <VStack gap={1} hAlign="stretch">
                <Text weight="semibold">Sao chép key ngay — key chỉ hiển thị một lần:</Text>
                <Code>{secret}</Code>
              </VStack>
            </Card>
          )}

          <HStack gap={3} vAlign="end" wrap="wrap">
            <StackItem size="fill">
              <TextInput
                label="Tên key"
                placeholder="Tên key (VD: CI bot)"
                value={name}
                onChange={setName}
              />
            </StackItem>
            <CheckboxInput
              label="Cho phép ghi (write)"
              value={canWrite}
              onChange={setCanWrite}
            />
            <Button
              label="Tạo key"
              variant="primary"
              icon={<Icon name="key" size={18} />}
              isDisabled={!name.trim() || !wsId}
              clickAction={create}
            />
          </HStack>
        </VStack>
      </Card>

      {keys.length === 0 ? (
        <EmptyState title="Chưa có API key nào." />
      ) : (
        <Card padding={0}>
          <List hasDividers>
            {keys.map((k) => (
              <ListItem
                key={k.id}
                label={k.name}
                description={`${k.prefix}… · ${k.lastUsedAt ? `dùng lần cuối ${new Date(k.lastUsedAt).toLocaleString()}` : "chưa dùng"}`}
                endContent={
                  <HStack gap={2} vAlign="center">
                    {k.scopes.map((s) => (
                      <Token key={s} label={s} />
                    ))}
                    <Badge
                      variant={k.active ? "success" : "neutral"}
                      label={k.active ? "đang dùng" : "đã thu hồi"}
                    />
                    {k.active && (
                      <IconButton
                        label="Thu hồi key"
                        tooltip="Thu hồi"
                        variant="ghost"
                        size="sm"
                        icon={<Icon name="block" size={18} />}
                        clickAction={async () => {
                          if (
                            !window.confirm(
                              `Thu hồi key "${k.name}"? Ứng dụng đang dùng key này sẽ mất quyền truy cập.`,
                            )
                          )
                            return;
                          await api.revokeApiKey(wsId, k.id).catch((e) => setErr(e.message));
                          load();
                        }}
                      />
                    )}
                  </HStack>
                }
              />
            ))}
          </List>
        </Card>
      )}
    </VStack>
  );
}

function RolesTab({
  wsId,
  roles,
  permissions,
  onChanged,
  onError,
  error,
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
      setName("");
      setPicked([]);
      setEditing(null);
      onChanged();
    } catch (err) {
      onError((err as Error).message);
    }
  }

  return (
    <VStack gap={5} hAlign="stretch">
      <Card padding={5}>
        <VStack gap={4} hAlign="stretch">
          <Heading level={3}>{editing ? "Sửa vai trò" : "Tạo vai trò tuỳ chỉnh"}</Heading>
          <TextInput
            label="Tên vai trò"
            placeholder="Tên vai trò (VD: QA Tester)"
            value={name}
            onChange={setName}
            status={error ? { type: "error", message: error } : undefined}
          />
          <VStack gap={2} hAlign="stretch">
            <Text type="label" color="secondary">
              Quyền hạn
            </Text>
            <Grid columns={{ minWidth: 200, repeat: "fit" }} gap={1}>
              {permissions.map((p) => (
                <CheckboxInput
                  key={p}
                  label={p}
                  value={picked.includes(p)}
                  onChange={() => toggle(p)}
                />
              ))}
            </Grid>
          </VStack>
          <HStack gap={2}>
            <Button
              label={editing ? "Lưu" : "Tạo vai trò"}
              variant="primary"
              icon={<Icon name={editing ? "save" : "add"} size={18} />}
              isDisabled={!name.trim() || !wsId}
              clickAction={save}
            />
            {editing && (
              <Button
                label="Huỷ"
                variant="ghost"
                onClick={() => {
                  setEditing(null);
                  setName("");
                  setPicked([]);
                }}
              />
            )}
          </HStack>
        </VStack>
      </Card>

      {roles.length === 0 ? (
        <EmptyState title="Chưa có vai trò tuỳ chỉnh nào." />
      ) : (
        <Card padding={0}>
          <List hasDividers>
            {roles.map((r) => (
              <ListItem
                key={r.id}
                label={r.name}
                description={
                  r.permissions.length === 0 ? "Chưa có quyền nào" : r.permissions.join(" · ")
                }
                endContent={
                  <HStack gap={1} vAlign="center">
                    <IconButton
                      label="Sửa vai trò"
                      tooltip="Sửa"
                      variant="ghost"
                      size="sm"
                      icon={<Icon name="edit" size={18} />}
                      onClick={() => {
                        setEditing(r.id);
                        setName(r.name);
                        setPicked(r.permissions);
                      }}
                    />
                    <IconButton
                      label="Xoá vai trò"
                      tooltip="Xoá"
                      variant="ghost"
                      size="sm"
                      icon={<Icon name="delete" size={18} />}
                      clickAction={async () => {
                        if (!window.confirm(`Xoá vai trò "${r.name}"?`)) return;
                        await api.deleteRole(wsId, r.id).catch((e) => onError(e.message));
                        onChanged();
                      }}
                    />
                  </HStack>
                }
              />
            ))}
          </List>
        </Card>
      )}
    </VStack>
  );
}

function TeamsTab({
  wsId,
  teams,
  members,
  onChanged,
  onError,
  error,
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
    <VStack gap={5} hAlign="stretch">
      <Card padding={5}>
        <VStack gap={3} hAlign="stretch">
          <Heading level={3}>Tạo phòng ban</Heading>
          <HStack gap={2} vAlign="end">
            <StackItem size="fill">
              <TextInput
                label="Tên phòng ban"
                placeholder="Tên phòng ban (VD: Marketing)"
                value={name}
                onChange={setName}
                status={error ? { type: "error", message: error } : undefined}
              />
            </StackItem>
            <Button
              label="Tạo"
              variant="primary"
              icon={<Icon name="add" size={18} />}
              isDisabled={!name.trim() || !wsId}
              clickAction={async () => {
                onError(null);
                try {
                  await api.createTeam(wsId, name.trim());
                  setName("");
                  onChanged();
                } catch (err) {
                  onError((err as Error).message);
                }
              }}
            />
          </HStack>
        </VStack>
      </Card>

      {teams.length === 0 ? (
        <EmptyState title="Chưa có phòng ban nào." />
      ) : (
        teams.map((t) => {
          const memberIds = new Set(t.members.map((m) => m.userId));
          return (
            <Card key={t.id} padding={4}>
              <VStack gap={3} hAlign="stretch">
                <HStack gap={2} vAlign="center">
                  <Text weight="semibold">{t.name}</Text>
                  <Text type="supporting">({t.members.length})</Text>
                  <StackItem size="fill" />
                  <IconButton
                    label="Xoá phòng ban"
                    tooltip="Xoá phòng ban"
                    variant="ghost"
                    size="sm"
                    icon={<Icon name="delete" size={18} />}
                    clickAction={async () => {
                      if (!window.confirm(`Xoá phòng ban "${t.name}"?`)) return;
                      await api.deleteTeam(wsId, t.id).catch((e) => onError(e.message));
                      onChanged();
                    }}
                  />
                </HStack>
                {members.length === 0 ? (
                  <Text type="supporting">Chưa có thành viên trong workspace.</Text>
                ) : (
                  <Grid columns={{ minWidth: 220, repeat: "fit" }} gap={1}>
                    {members.map((m) => (
                      <CheckboxInput
                        key={m.userId}
                        label={m.displayName || m.email}
                        value={memberIds.has(m.userId)}
                        onChange={async (checked) => {
                          await api
                            .setTeamMember(wsId, t.id, m.userId, checked)
                            .catch((err) => onError(err.message));
                          onChanged();
                        }}
                      />
                    ))}
                  </Grid>
                )}
              </VStack>
            </Card>
          );
        })
      )}
    </VStack>
  );
}
