"use client";

import { useEffect, useMemo, useState } from "react";
import { VStack, HStack, StackItem } from "@astryxdesign/core/Layout";
import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import { TextInput } from "@astryxdesign/core/TextInput";
import { Badge } from "@astryxdesign/core/Badge";
import { Text } from "@astryxdesign/core/Text";
import { EmptyState } from "@astryxdesign/core/EmptyState";
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
  login: "Đăng nhập",
  logout: "Đăng xuất",
};

/** Colour by risk: destructive actions should be findable at a glance. */
type BadgeVariant = "error" | "success" | "info" | "neutral";
function variantFor(action: string): BadgeVariant {
  if (/(delete|remove|revoke)/.test(action)) return "error";
  if (/(create|add)/.test(action)) return "success";
  if (/(login|logout|session)/.test(action)) return "info";
  return "neutral";
}

// Table yêu cầu hàng mở rộng Record<string, unknown>.
interface AuditRow extends Record<string, unknown> {
  id: string;
  createdAt: string;
  actorEmail: string;
  action: string;
  target: string;
  ip: string;
}

export default function AuditLogTab({ workspaceId }: { workspaceId: string }) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!workspaceId) return;
    setLoading(true);
    api
      .listAuditLog(workspaceId, 200)
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

  const rows: AuditRow[] = filtered.map((e) => ({
    id: e.id,
    createdAt: e.createdAt,
    actorEmail: e.actorEmail || "—",
    action: e.action,
    target: e.target || "—",
    ip: e.ip || "—",
  }));

  return (
    <VStack gap={5} hAlign="stretch">
      <HStack gap={4} vAlign="center" wrap="wrap">
        <Text type="supporting">200 hoạt động gần nhất trong không gian làm việc này.</Text>
        <StackItem size="fill" />
        <TextInput
          label="Lọc nhật ký"
          isLabelHidden
          size="sm"
          width={256}
          placeholder="Lọc theo người, hành động, IP…"
          value={query}
          onChange={setQuery}
          status={error ? { type: "error", message: error } : undefined}
        />
      </HStack>

      {loading && <Text color="secondary">Đang tải…</Text>}

      {!loading && rows.length === 0 ? (
        <EmptyState
          title={
            entries.length === 0
              ? "Chưa có hoạt động nào được ghi nhận."
              : "Không có kết quả phù hợp."
          }
          icon={<Icon name="history" size={40} />}
        />
      ) : (
        !loading && (
          // Dữ liệu dạng cột, dày → Table edge-to-edge, không bọc Card.
          <Table<AuditRow>
            data={rows}
            idKey="id"
            density="compact"
            hasHover
            textOverflow="truncate"
            columns={[
              {
                key: "createdAt",
                header: "Thời gian",
                width: pixel(170),
                renderCell: (r) => (
                  <Text type="supporting">{new Date(r.createdAt).toLocaleString()}</Text>
                ),
              },
              { key: "actorEmail", header: "Người thực hiện", width: proportional(1) },
              {
                key: "action",
                header: "Hành động",
                width: pixel(160),
                renderCell: (r) => (
                  <Badge
                    variant={variantFor(r.action)}
                    label={ACTION_LABELS[r.action] ?? r.action}
                  />
                ),
              },
              { key: "target", header: "Đối tượng", width: proportional(1) },
              { key: "ip", header: "IP", width: pixel(130) },
            ]}
          />
        )
      )}
    </VStack>
  );
}
