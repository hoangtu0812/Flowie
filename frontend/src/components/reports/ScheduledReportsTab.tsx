"use client";

import { useCallback, useEffect, useState } from "react";
import { api, Project, ScheduledReport } from "@/lib/api";
import Icon from "@/components/ui/Icon";

const FREQUENCIES = [
  { key: "daily", label: "Hằng ngày" },
  { key: "weekly", label: "Hằng tuần (thứ Hai)" },
  { key: "monthly", label: "Hằng tháng (ngày 1)" },
];

const PROVIDERS = [
  { key: "slack", label: "Slack" },
  { key: "teams", label: "Microsoft Teams" },
  { key: "webhook", label: "Webhook tuỳ ý" },
];

/**
 * Scheduled digests. The backend has shipped these since Module 5.2 but there
 * was no way to create one outside of curl, so nobody knew they existed.
 */
export default function ScheduledReportsTab({ workspaceId }: { workspaceId: string }) {
  const [reports, setReports] = useState<ScheduledReport[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState("weekly");
  const [provider, setProvider] = useState("slack");
  const [channelUrl, setChannelUrl] = useState("");
  const [hourUtc, setHourUtc] = useState(1); // 01:00 UTC ≈ 08:00 giờ VN
  const [projectId, setProjectId] = useState("");

  const load = useCallback(() => {
    if (!workspaceId) return;
    api.listReports(workspaceId).then(setReports).catch(() => setReports([]));
    api.listProjects(workspaceId).then(setProjects).catch(() => setProjects([]));
  }, [workspaceId]);

  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createReport(workspaceId, {
        name: name.trim(),
        frequency,
        provider,
        channelUrl: channelUrl.trim(),
        hourUtc,
        projectId: projectId || null,
      });
      setCreating(false);
      setName("");
      setChannelUrl("");
      load();
    } catch (err) { setError((err as Error).message); }
  }

  async function runNow(r: ScheduledReport) {
    setError(null);
    setNotice(null);
    try {
      await api.runReportNow(workspaceId, r.id);
      setNotice(`Đã gửi thử “${r.name}”.`);
      load();
    } catch (err) { setError((err as Error).message); }
  }

  return (
    <>
      <div className="flex items-start justify-between gap-md mb-lg">
        <p className="text-body-sm text-on-surface-variant max-w-xl">
          Tự động gửi bản tóm tắt tiến độ vào Slack/Teams theo lịch. Giờ tính theo
          UTC — Việt Nam là UTC+7.
        </p>
        <button className="btn-primary shrink-0" onClick={() => setCreating((v) => !v)}>
          <Icon name="add" size={18} /> Lịch gửi mới
        </button>
      </div>

      {error && <p className="text-error text-body-sm mb-md">{error}</p>}
      {notice && <p className="text-green-600 text-body-sm mb-md">{notice}</p>}

      {creating && (
        <form onSubmit={create} className="card p-lg mb-lg grid gap-md sm:grid-cols-2">
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Tên</label>
            <input className="field" placeholder="Tóm tắt tuần" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Phạm vi</label>
            <select className="field" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">Toàn bộ workspace</option>
              {projects.map((p) => (<option key={p.id} value={p.id}>{p.key} · {p.name}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Tần suất</label>
            <select className="field" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
              {FREQUENCIES.map((f) => (<option key={f.key} value={f.key}>{f.label}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">
              Giờ gửi (UTC) — {String(hourUtc).padStart(2, "0")}:00 UTC = {String((hourUtc + 7) % 24).padStart(2, "0")}:00 giờ VN
            </label>
            <select className="field" value={hourUtc} onChange={(e) => setHourUtc(Number(e.target.value))}>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Kênh</label>
            <select className="field" value={provider} onChange={(e) => setProvider(e.target.value)}>
              {PROVIDERS.map((p) => (<option key={p.key} value={p.key}>{p.label}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Incoming webhook URL</label>
            <input
              className="field"
              placeholder="https://hooks.slack.com/services/…"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2 flex justify-end gap-sm">
            <button type="button" className="btn-ghost" onClick={() => setCreating(false)}>Huỷ</button>
            <button className="btn-primary" disabled={!name.trim() || !channelUrl.trim()}>Tạo lịch</button>
          </div>
        </form>
      )}

      {reports.length === 0 ? (
        <div className="card p-xl text-center text-on-surface-variant">
          <Icon name="schedule_send" size={40} className="text-outline mb-sm" />
          <p>Chưa có lịch gửi báo cáo nào.</p>
        </div>
      ) : (
        <div className="card divide-y divide-outline-variant/40">
          {reports.map((r) => (
            <div key={r.id} className="p-lg flex flex-wrap items-center gap-md">
              <div className="min-w-0 flex-grow">
                <p className="text-body-lg font-semibold text-on-surface truncate">{r.name}</p>
                <p className="text-body-sm text-on-surface-variant truncate">
                  {FREQUENCIES.find((f) => f.key === r.frequency)?.label ?? r.frequency}
                  {" · "}{String(r.hourUtc).padStart(2, "0")}:00 UTC
                  {" · "}{PROVIDERS.find((p) => p.key === r.provider)?.label ?? r.provider}
                  {r.projectId
                    ? ` · ${projects.find((p) => p.id === r.projectId)?.key ?? "dự án"}`
                    : " · toàn workspace"}
                </p>
                {r.lastRunAt && (
                  <p className={`text-body-sm mt-1 ${r.lastError ? "text-red-500" : "text-on-surface-variant/70"}`}>
                    Lần gửi cuối: {new Date(r.lastRunAt).toLocaleString()}
                    {r.lastError ? ` — lỗi: ${r.lastError}` : ` — HTTP ${r.lastStatus}`}
                  </p>
                )}
              </div>
              <button className="btn-ghost" onClick={() => runNow(r)}>
                <Icon name="send" size={18} /> Gửi thử
              </button>
              <button
                className="btn-ghost text-red-500"
                onClick={async () => {
                  if (!window.confirm(`Xoá lịch "${r.name}"?`)) return;
                  await api.deleteReport(workspaceId, r.id).catch((e) => setError(e.message));
                  load();
                }}
              >
                <Icon name="delete" size={18} />
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
