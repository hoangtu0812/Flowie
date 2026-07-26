"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, ActiveTimer } from "@/lib/api";
import Icon from "../ui/Icon";

/** Formats seconds as H:MM:SS (or M:SS under an hour). */
export function formatElapsed(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

// Broadcast so the drawer and the top bar stay in sync without a global store.
const TIMER_EVENT = "flowie:timer-changed";
export function notifyTimerChanged() {
  window.dispatchEvent(new CustomEvent(TIMER_EVENT));
}

/** Subscribes to the caller's running timer, ticking locally every second. */
export function useActiveTimer() {
  const [timer, setTimer] = useState<ActiveTimer | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    const t = await api.activeTimer().catch(() => null);
    setTimer(t);
    setElapsed(t?.elapsedSecs ?? 0);
  }, []);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(TIMER_EVENT, onChange);
    // Re-sync periodically so elapsed time does not drift from the server.
    const poll = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener(TIMER_EVENT, onChange);
      clearInterval(poll);
    };
  }, [refresh]);

  useEffect(() => {
    if (tick.current) clearInterval(tick.current);
    if (!timer) return;
    tick.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
  }, [timer]);

  return { timer, elapsed, refresh };
}

/** Compact running-timer pill for the top bar. */
export default function TimerWidget() {
  const { timer, elapsed, refresh } = useActiveTimer();
  const [busy, setBusy] = useState(false);

  if (!timer) return null;

  async function stop() {
    setBusy(true);
    try {
      await api.stopTimer();
      await refresh();
      notifyTimerChanged();
    } finally {
      setBusy(false);
    }
  }

  /** Discards the running timer without writing a worklog — for the case where
   *  you left it running over lunch and don't want the hours counted. */
  async function cancel() {
    if (!window.confirm("Huỷ bộ đếm này? Thời gian sẽ không được ghi nhận.")) return;
    setBusy(true);
    try {
      await api.cancelTimer();
      await refresh();
      notifyTimerChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex items-center gap-2 pl-3 pr-1.5 py-1 rounded-full bg-green-50 border border-green-200"
      title={`${timer.projectKey} · ${timer.taskTitle}`}
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
      <span className="text-[13px] font-semibold text-green-800 tabular-nums">
        {formatElapsed(elapsed)}
      </span>
      <span className="text-[12px] text-green-700 max-w-[140px] truncate hidden lg:inline">
        {timer.taskTitle}
      </span>
      <button
        onClick={stop}
        disabled={busy}
        className="p-1 rounded-full hover:bg-green-100 text-green-700 disabled:opacity-50"
        title="Dừng và ghi giờ"
      >
        <Icon name="stop_circle" size={20} />
      </button>
      <button
        onClick={cancel}
        disabled={busy}
        className="p-1 rounded-full hover:bg-red-50 text-green-700 hover:text-red-600 disabled:opacity-50"
        title="Huỷ, không ghi giờ"
      >
        <Icon name="cancel" size={18} />
      </button>
    </div>
  );
}
