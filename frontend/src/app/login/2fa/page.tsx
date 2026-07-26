"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Icon from "@/components/ui/Icon";

/** Second step of login: the user proves possession of their authenticator. */
export default function TwoFactorChallengePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.verifyTwoFactor(code.trim());
      router.replace("/");
    } catch (err) {
      setError((err as Error).message || "Mã không đúng");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center bg-background p-md">
      <form onSubmit={submit} className="card p-xl w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-lg">
          <div className="w-14 h-14 rounded-2xl bg-primary-container/15 text-primary flex items-center justify-center mb-md">
            <Icon name="shield_lock" size={28} />
          </div>
          <h1 className="text-headline-lg text-on-surface">Xác thực hai lớp</h1>
          <p className="text-body-sm text-on-surface-variant mt-1">
            Nhập mã 6 chữ số từ ứng dụng xác thực của bạn.
          </p>
        </div>

        <input
          autoFocus
          inputMode="numeric"
          autoComplete="one-time-code"
          className="field text-center text-headline-md tracking-[0.4em] font-mono"
          placeholder="000000"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          maxLength={32}
        />

        {error && <p className="text-error text-body-sm mt-sm text-center">{error}</p>}

        <button className="btn-primary w-full mt-lg" disabled={busy || code.trim().length < 6}>
          {busy ? "Đang kiểm tra…" : "Xác nhận"}
        </button>

        <p className="text-body-sm text-on-surface-variant/70 mt-md text-center">
          Mất thiết bị? Nhập một <b>mã khôi phục</b> vào ô trên.
        </p>
      </form>
    </div>
  );
}
