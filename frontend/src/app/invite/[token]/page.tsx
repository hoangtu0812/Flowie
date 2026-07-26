"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import Icon from "@/components/ui/Icon";

/**
 * Landing page for an invitation link.
 *
 * The token is redeemed server-side against the signed-in user, so an
 * unauthenticated visitor is sent to log in first and returns here afterwards.
 */
export default function AcceptInvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<"working" | "done" | "error" | "anon">("working");
  const [message, setMessage] = useState("");

  const accept = useCallback(async () => {
    try {
      await api.me();
    } catch {
      setState("anon");
      return;
    }
    try {
      const r = await api.acceptInvite(token);
      setState("done");
      setTimeout(() => router.replace(`/workspaces/${r.workspaceId}`), 1200);
    } catch (err) {
      setMessage((err as Error).message);
      setState("error");
    }
  }, [token, router]);

  useEffect(() => { accept(); }, [accept]);

  return (
    <div className="min-h-screen grid place-items-center bg-background p-md">
      <div className="card p-xl w-full max-w-sm text-center">
        {state === "working" && (
          <>
            <Icon name="hourglass_top" size={32} className="text-primary mb-sm animate-pulse" />
            <p className="text-body-md text-on-surface">Đang xử lý lời mời…</p>
          </>
        )}

        {state === "done" && (
          <>
            <Icon name="check_circle" size={32} className="text-success mb-sm" />
            <h1 className="text-headline-md text-on-surface">Đã tham gia workspace</h1>
            <p className="text-body-sm text-on-surface-variant mt-1">Đang chuyển hướng…</p>
          </>
        )}

        {state === "anon" && (
          <>
            <Icon name="login" size={32} className="text-primary mb-sm" />
            <h1 className="text-headline-md text-on-surface">Cần đăng nhập</h1>
            <p className="text-body-sm text-on-surface-variant mt-1 mb-lg">
              Hãy đăng nhập bằng đúng email đã được mời, rồi mở lại liên kết này.
            </p>
            <a className="btn-primary w-full" href={api.loginUrl()}>
              Đăng nhập với Microsoft
            </a>
          </>
        )}

        {state === "error" && (
          <>
            <Icon name="error" size={32} className="text-error mb-sm" />
            <h1 className="text-headline-md text-on-surface">Không thể tham gia</h1>
            <p className="text-body-sm text-error mt-1">{message}</p>
            <button className="btn-ghost mt-lg" onClick={() => router.replace("/")}>
              Về trang chủ
            </button>
          </>
        )}
      </div>
    </div>
  );
}
