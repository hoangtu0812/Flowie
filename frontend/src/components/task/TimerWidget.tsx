"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { IconButton } from "@astryxdesign/core/IconButton";
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

  if (!timer) return null;

  // StatusDot thay cho chấm xanh tự vẽ; Card variant="green" thay cho
  // bg-green-50/border-green-200 hardcode.
  return (
    <Card variant="green" padding={1.5}>
      <HStack gap={2} vAlign="center">
        <StatusDot variant="success" label="Đang chạy" />
        <Text type="label" weight="semibold" hasTabularNumbers>
          {formatElapsed(elapsed)}
        </Text>
        <Text type="supporting" maxLines={1}>
          {timer.taskTitle}
        </Text>
        <IconButton
          label="Dừng và ghi giờ"
          tooltip="Dừng và ghi giờ"
          variant="ghost"
          size="sm"
          isDisabled={busy}
          icon={<Icon name="stop_circle" size={20} />}
          clickAction={stop}
        />
        <IconButton
          label="Huỷ, không ghi giờ"
          tooltip="Huỷ, không ghi giờ"
          variant="ghost"
          size="sm"
          isDisabled={busy}
          icon={<Icon name="cancel" size={18} />}
          clickAction={cancel}
        />
      </HStack>
    </Card>
  );
}
