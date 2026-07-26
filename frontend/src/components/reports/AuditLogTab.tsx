"use client";

import { useEffect, useMemo, useState } from "react";
import { api, AuditEntry } from "@/lib/api";
import Icon from "@/components/ui/Icon";

/** Human labels for the actions the backend records. */
const ACTION_LABELS: Record<string, string> = {
  "task.create": "Tạo công việc",
  "task.update": "Sửa công việc",
  "task.delete": "Xoá công việc",
  "project.create": "Tạo dự án",
  "project.update": "Sửa dự án",
  "member.add": "Thêm thành viên",
  "member.remove": "Gỡ thành viên",
  "member.role": "Đổi vai trò",
  "apikey.create": "Tạo API key",
  "apikey.revoke": "Thu hồi API key",
  "login": "Đăng nhập",
  "logout": "Đăng xuất",
};

/** Colour by risk: destructive actions should be findable at a glance. */
function tintFor(action: string): string {
  if (/(delete|remove|revoke)/.test(action)) return "bg-red-50 text-red-600";
  if (/(create|add)/.test(action)) return "bg-green-50 text-green-600";
  if (/(login|logout|session)/.test(action)) return "bg-blue-50 text-blue-600";
  return "bg-surface-container-high text-on-surface-variant";
}

export default function AuditLogTab({ workspaceId }: { workspaceId: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    api.listAuditLog(workspaceId, 200)
      .then(setEntries)
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [workspaceId]);

  const filtered = useMemo(() => {
    if (!query.trim()) return entries;
    const q = query.toLowerCase();
    return entries.filter((e) =>
      `${e.actorEmail} ${e.action} ${e.target} ${e.ip}`.toLowerCase().includes(q),
    );
  }, [entries, query]);

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-md mb-lg">
        <p className="text-body-sm text-on-surface-variant">
          200 hoạt động gần nhất trong không gian làm việc này.
        </p>
        <input
          className="field w-64"
          placeholder="Lọc theo người, hành động, IP…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {error && <p className="text-error text-body-sm mb-md">{error}</p>}
      {loading && <p className="text-on-surface-variant">Đang tải…</p>}

      {!loading && filtered.length === 0 ? (
        <div className="card p-xl text-center text-on-surface-variant">
          <Icon name="history" size={40} className="text-outline mb-sm" />
          <p>{entries.length === 0 ? "Chưa có hoạt động nào được ghi nhận." : "Không có kết quả phù hợp."}</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-body-md">
            <thead>
              <tr className="text-left text-on-surface-variant border-b border-outline-variant">
                <th className="py-3 px-lg font-semibold">Thời gian</th>
                <th className="py-3 px-lg font-semibold">Người thực hiện</th>
                <th className="py-3 px-lg font-semibold">Hành động</th>
                <th className="py-3 px-lg font-semibold">Đối tượng</th>
                <th className="py-3 px-lg font-semibold">IP</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-outline-variant/40 last:border-0">
                  <td className="py-2.5 px-lg whitespace-nowrap text-on-surface-variant">
                    {new Date(e.createdAt).toLocaleString()}
                  </td>
                  <td className="py-2.5 px-lg text-on-surface truncate max-w-[220px]">{e.actorEmail || "—"}</td>
                  <td className="py-2.5 px-lg">
                    <span className={`chip ${tintFor(e.action)}`}>
                      {ACTION_LABELS[e.action] ?? e.action}
                    </span>
                  </td>
                  <td className="py-2.5 px-lg text-on-surface-variant truncate max-w-[260px]">{e.target || "—"}</td>
                  <td className="py-2.5 px-lg text-on-surface-variant whitespace-nowrap">{e.ip || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
