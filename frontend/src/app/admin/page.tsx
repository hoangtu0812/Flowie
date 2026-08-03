"use client";

import { useCallback, useEffect, useState } from "react";
import { Section } from "@astryxdesign/core/Section";
import { Card } from "@astryxdesign/core/Card";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import { TabList, Tab } from "@astryxdesign/core/TabList";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Typeahead } from "@astryxdesign/core/Typeahead";
import { Button } from "@astryxdesign/core/Button";
import { Pagination } from "@astryxdesign/core/Pagination";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Avatar } from "@astryxdesign/core/Avatar";
import { Text } from "@astryxdesign/core/Text";
import { Heading } from "@astryxdesign/core/Heading";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { api, User, Workspace } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";

const PAGE_SIZE = 50;

interface UserRow extends Record<string, unknown> {
  id: string;
  displayName: string;
  email: string;
  isSystemAdmin: boolean;
}

interface WorkspaceRow extends Record<string, unknown> {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
}

/** Typeahead nhận item dạng { id, label }. */
interface OwnerItem {
  id: string;
  label: string;
}

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [tab, setTab] = useState<"users" | "workspaces">("users");

  const [newWsName, setNewWsName] = useState("");
  const [newWsOwner, setNewWsOwner] = useState("");
  const [wsError, setWsError] = useState("");
  const [selectedOwner, setSelectedOwner] = useState<OwnerItem | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadUsers = useCallback(() => {
    setLoadingUsers(true);
    api
      .adminListUsers({ q: search, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((res) => {
        setUsers(res.users);
        setTotal(res.total);
      })
      .catch(() => {
        setUsers([]);
        setTotal(0);
      })
      .finally(() => setLoadingUsers(false));
  }, [search, page]);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(loadUsers, 250);
    return () => clearTimeout(t);
  }, [loadUsers]);

  useEffect(() => {
    api.adminListWorkspaces().then((res) => setWorkspaces(res || [])).catch(() => {});
  }, []);

  // The owner picker searches the server too — it used to filter a full
  // in-memory copy of every user in the tenant. Typeahead gọi `search` khi gõ,
  // `bootstrap` khi mở lần đầu, nên phần debounce/ARIA/bàn phím do nó lo.
  const ownerSource = {
    search: async (query: string): Promise<OwnerItem[]> => {
      const res = await api.adminListUsers({ q: query, limit: 20 }).catch(() => null);
      return (res?.users ?? []).map((u) => ({
        id: u.id,
        label: `${u.displayName} (${u.email})`,
      }));
    },
    bootstrap: async (): Promise<OwnerItem[]> => {
      const res = await api.adminListUsers({ limit: 20 }).catch(() => null);
      return (res?.users ?? []).map((u) => ({
        id: u.id,
        label: `${u.displayName} (${u.email})`,
      }));
    },
  };

  async function toggleAdmin(u: UserRow) {
    await api.adminToggleUser(u.id, !u.isSystemAdmin);
    setUsers((prev) =>
      prev.map((x) => (x.id === u.id ? { ...x, isSystemAdmin: !x.isSystemAdmin } : x)),
    );
  }

  async function handleCreateWorkspace() {
    if (!newWsName.trim() || !newWsOwner || isCreating) return;
    try {
      setIsCreating(true);
      setWsError("");
      const ws = await api.adminCreateWorkspace(newWsName.trim(), newWsOwner);
      setWorkspaces([ws, ...(workspaces || [])]);
      setNewWsName("");
      setNewWsOwner("");
      setSelectedOwner(null);
    } catch (err) {
      setWsError((err as Error).message);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeleteWorkspace(id: string, name: string) {
    if (
      !window.confirm(
        `Bạn có chắc chắn muốn xóa không gian làm việc "${name}"? Hành động này sẽ xóa tất cả dự án, công việc liên quan và không thể hoàn tác.`,
      )
    )
      return;
    try {
      setDeletingId(id);
      await api.adminDeleteWorkspace(id);
      setWorkspaces((workspaces || []).filter((w) => w.id !== id));
      // Nếu workspace đang được chọn bị xóa, xóa khỏi localStorage
      if (localStorage.getItem("activeWorkspaceId") === id) {
        localStorage.removeItem("activeWorkspaceId");
      }
    } catch (err) {
      setWsError(`Lỗi khi xóa: ${(err as Error).message}`);
    } finally {
      setDeletingId(null);
    }
  }

  const userRows: UserRow[] = users.map((u) => ({
    id: u.id,
    displayName: u.displayName,
    email: u.email,
    isSystemAdmin: !!u.isSystemAdmin,
  }));

  const wsRows: WorkspaceRow[] = (workspaces || []).map((w) => ({
    id: w.id,
    name: w.name,
    slug: w.slug,
    createdBy: w.createdBy,
  }));

  return (
    <AppShell title={null}>
      <Section variant="transparent" padding={8} maxWidth={1400}>
        <VStack gap={6} hAlign="stretch">
          <HStack gap={4} vAlign="center" wrap="wrap">
            <VStack gap={1}>
              <Heading level={2}>Admin Panel</Heading>
              <Text type="supporting">
                Quản lý người dùng và không gian làm việc trên toàn hệ thống.
              </Text>
            </VStack>
            <StackItem size="fill" />
            {tab === "users" && (
              <Button
                label="Đồng bộ từ Azure"
                variant="primary"
                icon={<Icon name="sync" size={16} />}
                clickAction={async () => {
                  const res = await api.adminSyncAzureUsers();
                  setWsError("");
                  loadUsers();
                  window.alert(`Đã đồng bộ ${res.synced} người dùng từ Microsoft Azure!`);
                }}
              />
            )}
          </HStack>

          <TabList value={tab} onChange={(v) => setTab(v as "users" | "workspaces")} hasDivider>
            <Tab value="users" label={`Người dùng (${total})`} />
            <Tab value="workspaces" label={`Workspaces (${wsRows.length})`} />
          </TabList>

          {wsError && <Banner status="error" title={wsError} isDismissable onDismiss={() => setWsError("")} />}

          {tab === "users" && (
            <VStack gap={4} hAlign="stretch">
              <HStack gap={4} vAlign="center" wrap="wrap">
                <TextInput
                  label="Tìm người dùng"
                  isLabelHidden
                  width={320}
                  placeholder="Tìm theo tên hoặc email…"
                  value={search}
                  onChange={(v) => {
                    setSearch(v);
                    setPage(0);
                  }}
                />
                <StackItem size="fill" />
                <Text type="supporting">
                  {total === 0
                    ? "Không có kết quả"
                    : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} trên ${total}`}
                </Text>
              </HStack>

              <Card padding={0}>
                {loadingUsers ? (
                  <Section variant="transparent" padding={8}>
                    <Text color="secondary" justify="center">
                      Đang tải…
                    </Text>
                  </Section>
                ) : userRows.length === 0 ? (
                  <EmptyState title="Không tìm thấy người dùng nào." />
                ) : (
                  // Dữ liệu cột dày → Table, không bọc từng dòng trong Card.
                  <Table<UserRow>
                    data={userRows}
                    idKey="id"
                    density="compact"
                    hasHover
                    columns={[
                      {
                        key: "displayName",
                        header: "User",
                        width: proportional(1),
                        renderCell: (u) => (
                          <HStack gap={3} vAlign="center">
                            {/* Initials, not an <img>. This used to hit
                                ui-avatars.com once per row — thousands of external
                                requests that froze the page and kept running after
                                you navigated away. */}
                            <Avatar name={u.displayName || u.email} size={32} tooltip={false} />
                            <Text weight="semibold" maxLines={1}>
                              {u.displayName}
                            </Text>
                          </HStack>
                        ),
                      },
                      { key: "email", header: "Email", width: proportional(1) },
                      {
                        key: "isSystemAdmin",
                        header: "Admin Status",
                        width: pixel(150),
                        renderCell: (u) =>
                          u.isSystemAdmin ? (
                            <Badge variant="purple" label="System Admin" />
                          ) : (
                            <Badge label="User" />
                          ),
                      },
                      {
                        key: "id",
                        header: "Actions",
                        width: pixel(150),
                        renderCell: (u) => (
                          <Button
                            label={u.isSystemAdmin ? "Revoke Admin" : "Make Admin"}
                            variant={u.isSystemAdmin ? "destructive" : "secondary"}
                            size="sm"
                            clickAction={() => toggleAdmin(u)}
                          />
                        ),
                      },
                    ]}
                  />
                )}
              </Card>

              {total > PAGE_SIZE && (
                <HStack justify="center">
                  <Pagination
                    page={page + 1}
                    totalPages={Math.ceil(total / PAGE_SIZE)}
                    onChange={(p: number) => setPage(p - 1)}
                  />
                </HStack>
              )}
            </VStack>
          )}

          {tab === "workspaces" && (
            <VStack gap={6} hAlign="stretch">
              {/* Card gom một nhóm điều khiển tạo mới — đúng vai trò Card. */}
              <Card padding={6}>
                <VStack gap={4} hAlign="stretch">
                  <Heading level={3}>Tạo Không gian làm việc mới</Heading>
                  <HStack gap={4} vAlign="end" wrap="wrap">
                    <StackItem size="fill">
                      <TextInput
                        label="Tên workspace"
                        placeholder="Tên workspace..."
                        value={newWsName}
                        onChange={setNewWsName}
                      />
                    </StackItem>
                    <StackItem size="fill">
                      {/* Typeahead thay cho dropdown tự chế: nó lo sẵn bàn phím,
                          ARIA và click-outside. */}
                      <Typeahead<OwnerItem>
                        label="Chủ sở hữu (Owner)"
                        placeholder="Nhập tên hoặc email để tìm..."
                        value={selectedOwner}
                        onChange={(item) => {
                          setSelectedOwner(item);
                          setNewWsOwner(item?.id ?? "");
                        }}
                        searchSource={ownerSource}
                      />
                    </StackItem>
                    <Button
                      label={isCreating ? "Đang tạo..." : "Tạo mới"}
                      variant="primary"
                      isLoading={isCreating}
                      isDisabled={!newWsName.trim() || !newWsOwner || isCreating}
                      clickAction={handleCreateWorkspace}
                    />
                  </HStack>
                </VStack>
              </Card>

              <Card padding={0}>
                {wsRows.length === 0 ? (
                  <EmptyState title="Chưa có không gian làm việc nào." />
                ) : (
                  <Table<WorkspaceRow>
                    data={wsRows}
                    idKey="id"
                    density="compact"
                    hasHover
                    columns={[
                      {
                        key: "name",
                        header: "Workspace Name",
                        width: proportional(1),
                        renderCell: (w) => (
                          <HStack gap={3} vAlign="center">
                            <Icon name="workspaces" size={16} />
                            <Text weight="semibold" maxLines={1}>
                              {w.name}
                            </Text>
                          </HStack>
                        ),
                      },
                      { key: "slug", header: "Slug", width: proportional(1) },
                      { key: "createdBy", header: "Created By (ID)", width: proportional(1) },
                      {
                        key: "id",
                        header: "Actions",
                        width: pixel(120),
                        renderCell: (w) => (
                          <Button
                            label={deletingId === w.id ? "Đang xóa..." : "Xóa"}
                            variant="destructive"
                            size="sm"
                            icon={<Icon name="delete" size={16} />}
                            isLoading={deletingId === w.id}
                            isDisabled={deletingId === w.id}
                            clickAction={() => handleDeleteWorkspace(w.id, w.name)}
                          />
                        ),
                      },
                    ]}
                  />
                )}
              </Card>
            </VStack>
          )}
        </VStack>
      </Section>
    </AppShell>
  );
}
