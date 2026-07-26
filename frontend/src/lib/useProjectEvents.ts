"use client";

import { useEffect, useRef } from "react";
import { API_BASE } from "@/lib/api";

export interface RealtimeEvent {
  type: string;
  projectId: string;
  actorId?: string;
  payload?: Record<string, unknown>;
}

const EVENT_TYPES = [
  "task.created",
  "task.updated",
  "task.status_changed",
  "task.deleted",
  "task.commented",
  "chat.message",
];

/**
 * Subscribes to a project's live change stream (SSE) and invokes `onEvent`.
 *
 * The browser's EventSource reconnects on its own, so there is no retry logic
 * here. `onEvent` is kept in a ref so callers can pass an inline closure
 * without tearing down and re-opening the connection on every render.
 */
export function useProjectEvents(
  projectId: string | undefined,
  onEvent: (e: RealtimeEvent) => void,
) {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    if (!projectId) return;
    // withCredentials sends the httpOnly session cookie.
    const es = new EventSource(
      `${API_BASE}/api/v1/projects/${projectId}/events`,
      { withCredentials: true },
    );

    const dispatch = (ev: MessageEvent) => {
      try {
        handler.current(JSON.parse(ev.data) as RealtimeEvent);
      } catch {
        /* ignore malformed frames */
      }
    };

    EVENT_TYPES.forEach((t) => es.addEventListener(t, dispatch as EventListener));

    return () => {
      EVENT_TYPES.forEach((t) => es.removeEventListener(t, dispatch as EventListener));
      es.close();
    };
  }, [projectId]);
}
