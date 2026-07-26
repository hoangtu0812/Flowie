"use client";

import { useCallback, useEffect, useState } from "react";
import { api, User, UserSession } from "@/lib/api";
import AppShell from "@/components/layout/AppShell";
import Icon from "@/components/ui/Icon";

/** GDPR controls: export everything, or erase the account. */
function PrivacyCard({ email }: { email?: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function erase() {
    const typed = window.prompt(
      `Hành động này KHÔNG THỂ HOÀN TÁC.\n\n` +
        `Hồ sơ của bạn sẽ bị ẩn danh và tài khoản bị vô hiệu hoá. ` +
        `Công việc/bình luận vẫn còn nhưng không còn gắn với bạn.\n\n` +
        `Nhập email của bạn để xác nhận:`,
    );
    if (!typed) return;
    setBusy(true);
    setErr(null);
    try {
      await api.deleteMyData(typed.trim());
      window.location.href = "/login";
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card p-lg mb-lg">
      <h3 className="text-headline-md mb-1">Dữ liệu cá nhân</h3>
      <p className="text-body-sm text-on-surface-variant mb-md">
        Quyền truy cập, mang theo và xoá dữ liệu theo GDPR.
      </p>
      {err && <p className="text-error text-body-sm mb-sm">{err}</p>}
      <div className="flex flex-wrap gap-sm">
        <a className="btn-ghost" href={api.exportMyDataUrl()} download>
          <Icon name="download" size={18} /> Tải bản sao dữ liệu (JSON)
        </a>
        <button className="btn-ghost text-red-500" onClick={erase} disabled={busy}>
          <Icon name="delete_forever" size={18} /> Xoá tài khoản của tôi
        </button>
      </div>
      <p className="text-body-sm text-on-surface-variant/70 mt-sm">
        {email ? `Xác nhận bằng email: ${email}` : ""}
      </p>
    </div>
  );
}

/** Enrol / manage TOTP two-factor authentication. */
function TwoFactorCard() {
  const [status, setStatus] = useState<{ enabled: boolean; recoveryCodesLeft: number } | null>(null);
  const [uri, setUri] = useState<string | null>(null);
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.twoFactorStatus().then(setStatus).catch(() => setStatus(null));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function start() {
    setBusy(true); setErr(null);
    try {
      const r = await api.startTwoFactor();
      setUri(r.provisioningUri);
      setSecret(r.secret);
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function enable() {
    setBusy(true); setErr(null);
    try {
      const r = await api.enableTwoFactor(code.trim());
      setCodes(r.recoveryCodes);
      setUri(null); setCode("");
      load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  async function disable() {
    const c = window.prompt("Nhập mã 2FA (hoặc mã khôi phục) để tắt xác thực hai lớp:");
    if (!c) return;
    setBusy(true); setErr(null);
    try {
      await api.disableTwoFactor(c.trim());
      setCodes(null);
      load();
    } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="card p-lg mb-lg">
      <div className="flex items-start justify-between mb-md">
        <div>
          <h3 className="text-headline-md">Xác thực hai lớp (2FA)</h3>
          <p className="text-body-sm text-on-surface-variant mt-1">
            Dùng ứng dụng như Google Authenticator / Microsoft Authenticator.
          </p>
        </div>
        {status?.enabled && (
          <span className="chip bg-success-container text-success">Đang bật</span>
        )}
      </div>

      {err && <p className="text-error text-body-sm mb-sm">{err}</p>}

      {codes && (
        <div className="mb-md p-md rounded-xl border border-primary/30 bg-primary-container/5">
          <p className="text-body-sm font-semibold text-on-surface mb-sm">
            Lưu lại các mã khôi phục này — chúng chỉ hiện một lần:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 font-mono text-body-sm">
            {codes.map((c) => (
              <span key={c} className="px-2 py-1 rounded bg-surface-container text-on-surface">{c}</span>
            ))}
          </div>
        </div>
      )}

      {!status?.enabled && !uri && (
        <button className="btn-primary" onClick={start} disabled={busy}>
          <Icon name="shield_lock" size={18} /> Thiết lập 2FA
        </button>
      )}

      {uri && (
        <div className="flex flex-col gap-sm">
          <p className="text-body-sm text-on-surface-variant">
            Quét mã QR bằng ứng dụng xác thực, hoặc nhập khoá thủ công:
          </p>
          {/* QR rendered by a public chart service; the secret is short-lived
              and not yet active until confirmed below. */}
          <img
            alt="QR 2FA"
            className="w-40 h-40 rounded-lg border border-outline-variant bg-white p-1"
            src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}`}
          />
          <code className="text-body-sm bg-surface-container px-2 py-1 rounded break-all">{secret}</code>
          <div className="flex gap-sm items-center">
            <input
              className="field w-40 font-mono tracking-widest"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
            />
            <button className="btn-primary" onClick={enable} disabled={busy || code.trim().length < 6}>
              Bật 2FA
            </button>
          </div>
        </div>
      )}

      {status?.enabled && (
        <div className="flex items-center gap-md">
          <span className="text-body-sm text-on-surface-variant">
            Còn <b className="text-on-surface">{status.recoveryCodesLeft}</b> mã khôi phục
          </span>
          <button className="btn-ghost text-red-500" onClick={disable} disabled={busy}>
            <Icon name="shield" size={18} /> Tắt 2FA
          </button>
        </div>
      )}
    </div>
  );
}

// Turns a raw User-Agent into something readable in the device list.
function deviceLabel(ua: string): { icon: string; label: string } {
  if (!ua) return { icon: "devices", label: "Thiết bị không xác định" };
  const mobile = /Android|iPhone|iPad|Mobile/i.test(ua);
  let browser = "Trình duyệt";
  if (/Edg\//i.test(ua)) browser = "Edge";
  else if (/Chrome\//i.test(ua) && !/Edg\//i.test(ua)) browser = "Chrome";
  else if (/Firefox\//i.test(ua)) browser = "Firefox";
  else if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) browser = "Safari";
  let os = "";
  if (/Windows/i.test(ua)) os = "Windows";
  else if (/Mac OS X/i.test(ua)) os = "macOS";
  else if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad/i.test(ua)) os = "iOS";
  else if (/Linux/i.test(ua)) os = "Linux";
  const label = [browser, os].filter(Boolean).join(" · ") || ua.slice(0, 40);
  return { icon: mobile ? "smartphone" : "computer", label };
}

export default function SettingsPage() {
  const [me, setMe] = useState<User | null>(null);
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    api.listSessions().then(setSessions).catch(() => setSessions([]));
  }, []);

  useEffect(() => {
    api.me().then(setMe).catch(() => {});
    load();
  }, [load]);

  async function revoke(s: UserSession) {
    if (s.current) {
      if (!window.confirm("Đây là phiên hiện tại. Thu hồi sẽ đăng xuất bạn ngay. Tiếp tục?")) return;
    } else if (!window.confirm("Thu hồi phiên đăng nhập này?")) {
      return;
    }
    setBusy(s.id);
    try {
      await api.revokeSession(s.id);
      if (s.current) {
        window.location.href = "/login";
        return;
      }
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell title="Cài đặt">
      <div className="p-lg max-w-3xl">
        {/* Account */}
        <div className="card p-lg mb-lg">
          <h3 className="text-headline-md mb-md">Tài khoản</h3>
          <div className="flex items-center gap-md">
            {me?.avatarUrl ? (
              <img src={me.avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover border border-outline-variant" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-primary-container/20 text-primary flex items-center justify-center text-headline-md font-bold">
                {(me?.displayName || me?.email || "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <p className="text-on-surface font-semibold text-body-lg">{me?.displayName || "—"}</p>
              <p className="text-on-surface-variant text-body-sm truncate">{me?.email}</p>
              {me?.isSystemAdmin && (
                <span className="chip bg-primary text-on-primary mt-1 inline-block">System Admin</span>
              )}
            </div>
          </div>
        </div>

        <TwoFactorCard />
        <PrivacyCard email={me?.email} />

        {/* Sessions */}
        <div className="card p-lg">
          <div className="flex items-start justify-between mb-md">
            <div>
              <h3 className="text-headline-md">Thiết bị đang đăng nhập</h3>
              <p className="text-body-sm text-on-surface-variant mt-1">
                Thu hồi để đăng xuất thiết bị đó ngay lập tức.
              </p>
            </div>
            <button className="btn-ghost" onClick={load} title="Tải lại">
              <Icon name="refresh" size={18} />
            </button>
          </div>

          {error && <p className="text-error text-body-sm mb-sm">{error}</p>}

          <div className="flex flex-col gap-sm">
            {sessions.map((s) => {
              const d = deviceLabel(s.device);
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-md p-md rounded-xl border ${
                    s.current ? "border-primary/40 bg-primary-container/5" : "border-outline-variant"
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-surface-container-high text-on-surface-variant flex items-center justify-center shrink-0">
                    <Icon name={d.icon} size={20} />
                  </div>
                  <div className="min-w-0 flex-grow">
                    <p className="text-on-surface font-medium">
                      {d.label}
                      {s.current && <span className="chip bg-primary text-on-primary ml-2">Phiên hiện tại</span>}
                    </p>
                    <p className="text-body-sm text-on-surface-variant/70 truncate">
                      IP {s.ip} · hoạt động {new Date(s.lastSeen).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => revoke(s)}
                    disabled={busy === s.id}
                    className="btn-ghost text-red-500 hover:bg-red-50 disabled:opacity-50 shrink-0"
                  >
                    <Icon name="logout" size={18} />
                    {busy === s.id ? "Đang thu hồi…" : "Thu hồi"}
                  </button>
                </div>
              );
            })}
            {sessions.length === 0 && (
              <p className="text-body-sm text-on-surface-variant/60 py-lg text-center">
                Không có phiên nào được ghi nhận. Các phiên tạo trước khi bật tính năng này
                vẫn hoạt động nhưng không hiển thị ở đây.
              </p>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
