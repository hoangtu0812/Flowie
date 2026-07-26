"use client";

import { useCallback, useEffect, useState } from "react";
import { api, User, Workspace } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import Avatar from "@/components/ui/Avatar";

const PAGE_SIZE = 50;

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
  const [selectedOwner, setSelectedOwner] = useState<User | null>(null);
  const [wsError, setWsError] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchOwner, setSearchOwner] = useState("");
  const [ownerResults, setOwnerResults] = useState<User[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadUsers = useCallback(() => {
    setLoadingUsers(true);
    api
      .adminListUsers({ q: search, limit: PAGE_SIZE, offset: page * PAGE_SIZE })
      .then((res) => { setUsers(res.users); setTotal(res.total); })
      .catch(() => { setUsers([]); setTotal(0); })
      .finally(() => setLoadingUsers(false));
  }, [search, page]);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(loadUsers, 250);
    return () => clearTimeout(t);
  }, [loadUsers]);

  useEffect(() => {
    api.adminListWorkspaces().then(res => setWorkspaces(res || [])).catch(() => {});
  }, []);

  // The owner picker searches the server too — it used to filter a full
  // in-memory copy of every user in the tenant.
  useEffect(() => {
    if (!dropdownOpen) return;
    const t = setTimeout(() => {
      api
        .adminListUsers({ q: searchOwner, limit: 20 })
        .then((res) => setOwnerResults(res.users))
        .catch(() => setOwnerResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [dropdownOpen, searchOwner]);

  async function toggleAdmin(u: User) {
    await api.adminToggleUser(u.id, !u.isSystemAdmin);
    setUsers((prev) => prev.map(x => x.id === u.id ? { ...x, isSystemAdmin: !x.isSystemAdmin } : x));
  }

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (!newWsName.trim() || !newWsOwner || isCreating) return;
    try {
      setIsCreating(true);
      setWsError("");
      const ws = await api.adminCreateWorkspace(newWsName.trim(), newWsOwner);
      setWorkspaces([ws, ...(workspaces || [])]);
      setNewWsName("");
      setNewWsOwner("");
      setSelectedOwner(null);
    } catch (err: any) {
      setWsError(err.message);
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDeleteWorkspace(id: string, name: string) {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa không gian làm việc "${name}"? Hành động này sẽ xóa tất cả dự án, công việc liên quan và không thể hoàn tác.`)) return;
    try {
      setDeletingId(id);
      await api.adminDeleteWorkspace(id);
      setWorkspaces((workspaces || []).filter(w => w.id !== id));
      // Nếu workspace đang được chọn bị xóa, xóa khỏi localStorage
      if (localStorage.getItem('activeWorkspaceId') === id) {
        localStorage.removeItem('activeWorkspaceId');
      }
    } catch (err: any) {
      alert(`Lỗi khi xóa: ${err.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <AppShell title={null}>
      <div className="p-8 max-w-[1400px] mx-auto bg-white min-h-screen">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-[28px] font-bold text-gray-900">Admin Panel</h2>
            <p className="text-[14px] text-gray-500 mt-1">Quản lý người dùng và không gian làm việc trên toàn hệ thống.</p>
          </div>
          {tab === "users" && (
            <button
              onClick={async () => {
                const res = await api.adminSyncAzureUsers();
                alert(`Đã đồng bộ ${res.synced} người dùng từ Microsoft Azure!`);
                loadUsers();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg text-[13px] font-semibold hover:bg-gray-800 transition-colors shadow-sm"
            >
              <Icon name="sync" size={16} />
              Đồng bộ từ Azure
            </button>
          )}
        </div>

        <div className="flex gap-4 border-b border-gray-100 mb-6">
          <button 
            className={`pb-3 px-2 text-[14px] font-bold border-b-2 transition-colors ${tab === "users" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-900"}`}
            onClick={() => setTab("users")}
          >
            Người dùng ({total})
          </button>
          <button 
            className={`pb-3 px-2 text-[14px] font-bold border-b-2 transition-colors ${tab === "workspaces" ? "border-blue-600 text-blue-600" : "border-transparent text-gray-500 hover:text-gray-900"}`}
            onClick={() => setTab("workspaces")}
          >
            Workspaces ({(workspaces || []).length})
          </button>
        </div>

        {tab === "users" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <input
                className="field w-80"
                placeholder="Tìm theo tên hoặc email…"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              />
              <span className="text-[13px] text-gray-500">
                {total === 0 ? "Không có kết quả" : `${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} trên ${total}`}
              </span>
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-[12px] font-bold text-gray-500 uppercase">
                    <th className="py-4 px-6">User</th>
                    <th className="py-4 px-6">Email</th>
                    <th className="py-4 px-6">Admin Status</th>
                    <th className="py-4 px-6 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loadingUsers && (
                    <tr><td colSpan={4} className="py-10 text-center text-gray-500">Đang tải…</td></tr>
                  )}
                  {!loadingUsers && users.length === 0 && (
                    <tr><td colSpan={4} className="py-10 text-center text-gray-500">Không tìm thấy người dùng nào.</td></tr>
                  )}
                  {!loadingUsers && users.map(u => (
                    <tr key={u.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          {/* Initials, not an <img>. This used to hit
                              ui-avatars.com once per row — thousands of external
                              requests that froze the page and kept running after
                              you navigated away. */}
                          <Avatar name={u.displayName || u.email} size={32} />
                          <span className="font-semibold text-[14px] text-gray-900">{u.displayName}</span>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-[14px] text-gray-500">{u.email}</td>
                      <td className="py-4 px-6">
                        {u.isSystemAdmin ? (
                          <span className="px-2.5 py-1 bg-purple-50 text-purple-600 text-[12px] font-bold rounded-full border border-purple-100">System Admin</span>
                        ) : (
                          <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-[12px] font-bold rounded-full border border-gray-200">User</span>
                        )}
                      </td>
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => toggleAdmin(u)}
                          className={`px-3 py-1.5 rounded-lg text-[13px] font-bold transition-colors shadow-sm ${u.isSystemAdmin ? "bg-white border border-red-200 text-red-600 hover:bg-red-50" : "bg-white border border-blue-200 text-blue-600 hover:bg-blue-50"}`}
                        >
                          {u.isSystemAdmin ? "Revoke Admin" : "Make Admin"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {total > PAGE_SIZE && (
              <div className="flex items-center justify-center gap-4 mt-4">
                <button className="btn-ghost" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                  <Icon name="chevron_left" size={18} /> Trước
                </button>
                <span className="text-[13px] text-gray-500">
                  Trang {page + 1} / {Math.ceil(total / PAGE_SIZE)}
                </span>
                <button
                  className="btn-ghost"
                  disabled={(page + 1) * PAGE_SIZE >= total}
                  onClick={() => setPage(p => p + 1)}
                >
                  Sau <Icon name="chevron_right" size={18} />
                </button>
              </div>
            )}
          </>
        )}

        {tab === "workspaces" && (
          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
              <h3 className="text-[16px] font-bold text-gray-900 mb-4">Tạo Không gian làm việc mới</h3>
              <form onSubmit={handleCreateWorkspace} className="flex gap-4 items-start max-w-3xl">
                <div className="flex-1">
                  <input
                    className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2 text-[14px] outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 transition-all shadow-sm"
                    placeholder="Tên workspace..."
                    value={newWsName}
                    onChange={(e) => setNewWsName(e.target.value)}
                  />
                </div>
                <div className="flex-1 relative">
                  <div 
                    className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2 text-[14px] cursor-pointer shadow-sm flex items-center justify-between hover:border-gray-300 transition-colors"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                  >
                    <span className={selectedOwner ? "text-gray-900 font-medium" : "text-gray-500"}>
                      {selectedOwner ? `${selectedOwner.displayName} (${selectedOwner.email})` : "-- Chọn Chủ sở hữu (Owner) --"}
                    </span>
                    <Icon name="expand_more" size={18} className="text-gray-400" />
                  </div>
                  {dropdownOpen && (
                    <div className="absolute top-full left-0 w-full bg-white border border-gray-200 shadow-xl rounded-lg mt-1 z-50 max-h-64 flex flex-col overflow-hidden">
                      <div className="p-2 border-b border-gray-100 bg-gray-50">
                        <input
                          type="text"
                          autoFocus
                          className="w-full bg-white border border-gray-200 rounded px-3 py-1.5 text-[13px] outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all shadow-sm"
                          placeholder="Nhập tên hoặc email để tìm..."
                          value={searchOwner}
                          onChange={(e) => setSearchOwner(e.target.value)}
                        />
                      </div>
                      <div className="overflow-y-auto">
                        {ownerResults.length === 0 && (
                          <div className="p-4 text-center text-[13px] text-gray-500">
                            {searchOwner ? "Không tìm thấy người dùng phù hợp" : "Gõ để tìm người dùng…"}
                          </div>
                        )}
                        {ownerResults.map(u => (
                          <div
                            key={u.id}
                            className="px-4 py-2.5 text-[13px] hover:bg-blue-50 cursor-pointer border-b border-gray-50 last:border-0 transition-colors"
                            onClick={() => {
                              setNewWsOwner(u.id);
                              setSelectedOwner(u);
                              setDropdownOpen(false);
                              setSearchOwner("");
                            }}
                          >
                            <span className="font-semibold text-gray-900">{u.displayName}</span>
                            <span className="text-gray-500 ml-1">({u.email})</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="submit"
                  disabled={!newWsName.trim() || !newWsOwner || isCreating}
                  className="px-6 py-2 bg-gray-900 text-white rounded-lg text-[14px] font-bold hover:bg-black transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap flex items-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <Icon name="sync" size={16} className="animate-spin" />
                      Đang tạo...
                    </>
                  ) : (
                    "Tạo mới"
                  )}
                </button>
              </form>
              {wsError && <p className="text-red-500 text-[13px] mt-2">{wsError}</p>}
            </div>

            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-[12px] font-bold text-gray-500 uppercase">
                  <th className="py-4 px-6">Workspace Name</th>
                  <th className="py-4 px-6">Slug</th>
                  <th className="py-4 px-6">Created By (ID)</th>
                  <th className="py-4 px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(workspaces || []).map(w => (
                  <tr key={w.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                          <Icon name="workspaces" size={16} />
                        </div>
                        <span className="font-semibold text-[14px] text-gray-900">{w.name}</span>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-[14px] text-gray-500">{w.slug}</td>
                    <td className="py-4 px-6 text-[13px] text-gray-400 font-mono">{w.createdBy}</td>
                    <td className="py-4 px-6 text-right">
                      <button
                        onClick={() => handleDeleteWorkspace(w.id, w.name)}
                        disabled={deletingId === w.id}
                        className="px-3 py-1.5 rounded-lg text-[13px] font-bold transition-colors shadow-sm bg-white border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 ml-auto"
                      >
                        {deletingId === w.id ? (
                          <>
                            <Icon name="sync" size={16} className="animate-spin" />
                            Đang xóa...
                          </>
                        ) : (
                          <>
                            <Icon name="delete" size={16} />
                            Xóa
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  </AppShell>
  );
}
