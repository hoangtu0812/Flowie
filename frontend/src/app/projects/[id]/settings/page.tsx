"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { api, Integration, Project, Webhook, WorkflowStatus } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";
import ProjectTabs from "@/components/layout/ProjectTabs";
import { statusChipStyle } from "@/lib/status";
import ColorPicker from "@/components/ui/ColorPicker";

const CATEGORIES = [
  { key: "todo", label: "Chưa làm" },
  { key: "in_progress", label: "Đang làm" },
  { key: "done", label: "Hoàn thành" },
];

export default function ProjectSettingsPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [statuses, setStatuses] = useState<WorkflowStatus[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("todo");
  const [color, setColor] = useState("#2563eb");
  const [wip, setWip] = useState("");

  const load = useCallback(() => {
    api.listStatuses(id).then(setStatuses).catch(() => setStatuses([]));
  }, [id]);

  useEffect(() => {
    api.getProject(id).then(setProject).catch(() => {});
    load();
  }, [id, load]);

  async function addStatus() {
    const n = name.trim();
    if (!n) return;
    setError(null);
    try {
      const limit = wip.trim() === "" ? null : Number(wip);
      await api.createStatus(id, { name: n, category, color, wipLimit: limit });
      setName(""); setWip("");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function patch(s: WorkflowStatus, data: Record<string, unknown>) {
    setError(null);
    try {
      await api.updateStatus(id, s.id, data);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function remove(s: WorkflowStatus) {
    if (!window.confirm(
      `Xoá cột "${s.name}"?\nCác công việc trong cột này sẽ được chuyển sang cột đầu tiên.`,
    )) return;
    setError(null);
    try {
      await api.deleteStatus(id, s.id);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function moveCol(s: WorkflowStatus, dir: -1 | 1) {
    const i = statuses.findIndex((x) => x.id === s.id);
    const j = i + dir;
    if (j < 0 || j >= statuses.length) return;
    // Swap positions with the neighbour.
    await api.updateStatus(id, s.id, { position: statuses[j].position }).catch(() => {});
    await api.updateStatus(id, statuses[j].id, { position: s.position }).catch(() => {});
    load();
  }

  return (
    <AppShell title={project ? `${project.key} · Cài đặt` : "Cài đặt dự án"}>
      <div className="p-lg">
        <ProjectTabs projectId={id} />


                  <select
                    className="text-body-sm border border-outline-variant rounded-md px-2 py-1"
                    value={s.category}
                    onChange={(e) => patch(s, { category: e.target.value })}
                  >
                    {CATEGORIES.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
                  </select>

                  <ColorPicker value={s.color} onChange={(c) => patch(s, { color: c })} />

                  <div className="flex items-center gap-1">
                    <span className="text-body-sm text-on-surface-variant">WIP</span>
                    <input
                      type="number"
                      min={0}
                      placeholder="—"
                      defaultValue={s.wipLimit ?? ""}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v === "" && s.wipLimit != null) patch(s, { clearWip: true });
                        else if (v !== "" && Number(v) !== s.wipLimit) patch(s, { wipLimit: Number(v) });
                      }}
                      className="w-20 text-body-sm border border-outline-variant rounded-md px-2 py-1"
                    />
                  </div>

                  <span className="text-body-sm text-on-surface-variant/70">
                    {s.taskCount} việc
                  </span>

                  <button
                    className="ml-auto p-2 rounded-full hover:bg-red-50 text-red-500"
                    onClick={() => remove(s)}
                    title="Xoá cột"
                  >
                    <Icon name="delete" size={18} />
                  </button>
                </div>
              );
            })}
            {statuses.length === 0 && (
              <p className="text-body-sm text-on-surface-variant/60">
                Dự án chưa có cột tuỳ chỉnh — Board đang dùng bộ cột mặc định.
              </p>
            )}
          </div>

          <div className="border-t border-outline-variant pt-md">
            <p className="text-label-md text-on-surface-variant mb-sm">Thêm cột mới</p>
            <div className="flex flex-wrap gap-sm items-end">
              <input
                className="field w-48"
                placeholder="Tên cột (VD: Blocked)"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <select className="field w-36" value={category} onChange={(e) => setCategory(e.target.value)}>
                {CATEGORIES.map((c) => (<option key={c.key} value={c.key}>{c.label}</option>))}
              </select>
              <div className="pb-1">
                <ColorPicker value={color} onChange={setColor} />
              </div>
              <input
                className="field w-28"
                type="number"
                min={0}
                placeholder="WIP limit"
                value={wip}
                onChange={(e) => setWip(e.target.value)}
              />
              <button className="btn-primary" onClick={addStatus} disabled={!name.trim()}>
                <Icon name="add" size={18} /> Thêm cột
              </button>
            </div>
          </div>
        </div>

        <IntegrationsCard projectId={id} />
        <WebhooksCard projectId={id} />
      </div>
    </AppShell>
  );
}

/** Events the backend can deliver, in the order they occur in a task's life. */
const WEBHOOK_EVENTS = [
  { key: "task.created", label: "Tạo công việc" },
  { key: "task.updated", label: "Sửa công việc" },
  { key: "task.status_changed", label: "Đổi trạng thái" },
  { key: "task.assigned", label: "Giao việc" },
  { key: "task.completed", label: "Hoàn thành" },
  { key: "task.deleted", label: "Xoá công việc" },
  { key: "comment.created", label: "Bình luận mới" },
];

/**
 * Outgoing webhooks — POST project events to any HTTPS endpoint, signed with
 * HMAC-SHA256 so the receiver can verify the payload came from Flowie.
 */
function WebhooksCard({ projectId }: { projectId: string }) {
  const [list, setList] = useState<Webhook[]>([]);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [events, setEvents] = useState<string[]>(["task.created", "task.status_changed"]);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listWebhooks(projectId).then(setList).catch(() => setList([]));
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  function toggleEvent(key: string) {
    setEvents((prev) => (prev.includes(key) ? prev.filter((e) => e !== key) : [...prev, key]));
  }

  async function add() {
    setErr(null);
    try {
      await api.createWebhook(projectId, {
        url: url.trim(),
        events,
        secret: secret.trim() || undefined,
      });
      setUrl("");
      setSecret("");
      load();
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="card p-lg">
      <h3 className="text-headline-md mb-1">Webhook ra ngoài</h3>
      <p className="text-body-sm text-on-surface-variant mb-md">
        Gửi sự kiện dự án dưới dạng JSON POST tới hệ thống của bạn. Nếu đặt secret,
        mỗi request kèm chữ ký <b>HMAC-SHA256</b> ở header <code>X-Flowie-Signature</code>.
      </p>
      {err && <p className="text-error text-body-sm mb-sm">{err}</p>}

      <div className="flex flex-col gap-sm mb-md">
        {list.map((w) => (
          <div key={w.id} className="flex flex-wrap items-center gap-sm p-sm border border-outline-variant rounded-lg">
            <span className="text-body-sm text-on-surface truncate flex-grow min-w-0">{w.url}</span>
            {w.hasSecret && (
              <span className="chip bg-green-50 text-green-600" title="Có chữ ký HMAC">
                <Icon name="lock" size={14} /> ký
              </span>
            )}
            {w.lastStatus != null && (
              <span className={`chip ${w.lastStatus < 300 ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                {w.lastStatus}
              </span>
            )}
            <span className="text-body-sm text-on-surface-variant w-full sm:w-auto">
              {w.events.length === 0 ? "mọi sự kiện" : `${w.events.length} sự kiện`}
            </span>
            <button
              className="p-2 rounded-full hover:bg-red-50 text-red-500"
              onClick={async () => {
                if (!window.confirm("Xoá webhook này?")) return;
                await api.deleteWebhook(projectId, w.id).catch((e) => setErr(e.message));
                load();
              }}
            >
              <Icon name="delete" size={18} />
            </button>
            {w.lastError && (
              <p className="w-full text-body-sm text-red-500">Lỗi lần gửi cuối: {w.lastError}</p>
            )}
          </div>
        ))}
        {list.length === 0 && (
          <p className="text-body-sm text-on-surface-variant/60">Chưa có webhook nào.</p>
        )}
      </div>

      <div className="border-t border-outline-variant pt-md flex flex-col gap-sm">
        <div className="flex flex-wrap gap-sm">
          <input
            className="field flex-grow min-w-60"
            placeholder="https://api.congty.vn/flowie-hook"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <input
            className="field w-52"
            placeholder="Secret (tuỳ chọn)"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-xs">
          {WEBHOOK_EVENTS.map((e) => (
            <button
              key={e.key}
              onClick={() => toggleEvent(e.key)}
              className={`chip ${
                events.includes(e.key)
                  ? "bg-blue-50 text-blue-600"
                  : "bg-surface-container-high text-on-surface-variant opacity-60"
              }`}
            >
              {e.label}
            </button>
          ))}
        </div>
        <button className="btn-primary w-fit" onClick={add} disabled={!url.trim()}>
          <Icon name="add" size={18} /> Thêm webhook
        </button>
      </div>
    </div>
  );
}

/** Connect Slack / MS Teams incoming webhooks to project events. */
function IntegrationsCard({ projectId }: { projectId: string }) {
  const [list, setList] = useState<Integration[]>([]);
  const [provider, setProvider] = useState("slack");
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listIntegrations(projectId).then(setList).catch(() => setList([]));
  }, [projectId]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setErr(null);
    try {
      await api.createIntegration(projectId, { provider, webhookUrl: url.trim() });
      setUrl("");
      load();
    } catch (e) { setErr((e as Error).message); }
  }

  return (
    <div className="card p-lg">
      <h3 className="text-headline-md mb-1">Tích hợp Chat</h3>
      <p className="text-body-sm text-on-surface-variant mb-md">
        Gửi thông báo sự kiện dự án sang Slack hoặc Microsoft Teams qua
        <b> Incoming Webhook</b>.
      </p>
      {err && <p className="text-error text-body-sm mb-sm">{err}</p>}

      <div className="flex flex-col gap-sm mb-md">
        {list.map((i) => (
          <div key={i.id} className="flex items-center gap-sm p-sm border border-outline-variant rounded-xl">
            <span className={`chip ${i.provider === "slack" ? "bg-[#4a154b] text-white" : "bg-[#4b53bc] text-white"}`}>
              {i.provider}
            </span>
            <span className="text-body-sm text-on-surface-variant truncate flex-grow">
              {i.webhookUrl.slice(0, 48)}…
            </span>
            {i.lastStatus != null && (
              <span className={`chip ${i.lastStatus < 300 ? "bg-success-container text-success" : "bg-error-container text-on-error-container"}`}>
                {i.lastStatus}
              </span>
            )}
            <button
              className="p-2 rounded-full hover:bg-red-50 text-red-500"
              onClick={async () => {
                if (!window.confirm("Xoá tích hợp này?")) return;
                await api.deleteIntegration(projectId, i.id).catch((e) => setErr(e.message));
                load();
              }}
            >
              <Icon name="delete" size={18} />
            </button>
          </div>
        ))}
        {list.length === 0 && (
          <p className="text-body-sm text-on-surface-variant/60">Chưa có tích hợp nào.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-sm items-end border-t border-outline-variant pt-md">
        <select className="field w-32" value={provider} onChange={(e) => setProvider(e.target.value)}>
          <option value="slack">Slack</option>
          <option value="teams">MS Teams</option>
        </select>
        <input
          className="field flex-grow min-w-60"
          placeholder="https://hooks.slack.com/services/…"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <button className="btn-primary" onClick={add} disabled={!url.trim()}>
          <Icon name="add" size={18} /> Kết nối
        </button>
      </div>
    </div>
  );
}
