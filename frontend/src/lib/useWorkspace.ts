"use client";

import { useCallback, useEffect, useState } from "react";
import { api, Workspace } from "@/lib/api";

const STORAGE_KEY = "activeWorkspaceId";

/**
 * Resolves the workspace the user is currently working in.
 *
 * Pages used to read `localStorage.activeWorkspaceId` directly, which left them
 * blank ("please pick a workspace") for anyone who had not clicked the switcher
 * yet. This falls back to the first workspace the user belongs to and persists
 * that choice, so every page has a workspace as soon as the user has one.
 */
export function useWorkspace() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspaceId, setWorkspaceIdState] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .listWorkspaces()
      .then((list) => {
        if (cancelled) return;
        setWorkspaces(list);
        const stored = localStorage.getItem(STORAGE_KEY);
        const pick = list.find((w) => w.id === stored) ?? list[0];
        if (pick) {
          setWorkspaceIdState(pick.id);
          localStorage.setItem(STORAGE_KEY, pick.id);
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const setWorkspaceId = useCallback((id: string) => {
    setWorkspaceIdState(id);
    localStorage.setItem(STORAGE_KEY, id);
  }, []);

  const workspace = workspaces.find((w) => w.id === workspaceId) ?? null;

  return { workspaces, workspace, workspaceId, setWorkspaceId, loading };
}
