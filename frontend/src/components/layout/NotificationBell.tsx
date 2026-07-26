"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api, Notification } from "@/lib/api";
import Icon from "../ui/Icon";

const TYPE_ICON: Record<string, string> = {
  assigned: "assignment_ind",
  commented: "chat_bubble",
  mentioned: "alternate_email",
  due_soon: "event_upcoming",
};

export default function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  async function load() {
    try {
      const r = await api.notifications();
      setItems(r.notifications);
      setUnread(r.unread);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
    timer.current = setInterval(load, 30000); // poll every 30s
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, []);

  // Opening the panel used to mark everything read, which made it impossible to
  // come back to something later. Reading is now per-item (or "Đọc hết").
  function toggle() {
    setOpen((v) => !v);
  }

  async function markRead(n: Notification) {
    if (n.readAt) return;
    setItems((p) => p.map((x) => (x.id === n.id ? { ...x, readAt: new Date().toISOString() } : x)));
    setUnread((u) => Math.max(0, u - 1));
    await api.markNotificationRead(n.id).catch(() => load());
  }

  return (
    <div className="relative">
      <button
        onClick={toggle}
        className="p-2 rounded-full hover:bg-surface-container-highest transition-colors active:scale-95 text-on-surface-variant relative"
      >
        <Icon name="notifications" size={22} />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-4 h-4 px-1 bg-error text-on-error rounded-full text-label-sm flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 card shadow-popover z-50 overflow-hidden" onMouseLeave={() => setOpen(false)}>
          <div className="px-md py-2 border-b border-outline-variant flex items-center justify-between">
            <span className="text-label-md text-on-surface">Thông báo</span>
            <button className="text-body-sm text-primary" onClick={() => api.markAllNotificationsRead().then(load)}>
              Đọc hết
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-md py-lg text-center text-body-sm text-on-surface-variant/60">Không có thông báo.</p>
            )}
            {items.map((n) => (
              <div
                key={n.id}
                className={`group flex gap-sm px-md py-2.5 border-b border-outline-variant/50 ${n.readAt ? "" : "bg-primary-container/5"}`}
              >
                <Icon name={TYPE_ICON[n.type] ?? "notifications"} size={18} className="text-primary mt-0.5 shrink-0" />
                {/* Notifications were dead text — being assigned a task or
                    mentioned gave you no way to reach it. `link` comes from the
                    backend and opens the task (and the comment, for mentions). */}
                <button
                  className="min-w-0 flex-grow text-left disabled:cursor-default"
                  disabled={!n.link}
                  onClick={() => {
                    if (!n.link) return;
                    markRead(n);
                    setOpen(false);
                    router.push(n.link);
                  }}
                >
                  <p className={`text-body-sm font-medium ${n.link ? "text-on-surface group-hover:text-primary" : "text-on-surface"}`}>
                    {n.title}
                  </p>
                  {n.body && <p className="text-body-sm text-on-surface-variant truncate">{n.body}</p>}
                  <p className="text-label-sm text-on-surface-variant/60">{new Date(n.createdAt).toLocaleString()}</p>
                </button>
                {!n.readAt && (
                  <button
                    onClick={() => markRead(n)}
                    title="Đánh dấu đã đọc"
                    className="self-start p-1 rounded-full text-on-surface-variant opacity-0 group-hover:opacity-100 hover:bg-surface-container transition-opacity"
                  >
                    <Icon name="done" size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
