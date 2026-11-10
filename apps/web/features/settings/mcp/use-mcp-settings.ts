'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SubmissionGate } from '@/features/shared/submission-gate';
import { loadCurrentWorkspaceMembership } from '@/lib/workspaces';
import {
   createMcpConnection,
   getMcpConfiguration,
   getMcpResources,
   listMcpConnections,
   revokeMcpConnection,
   updateMcpConnection,
   type ConnectionDraft,
   type McpConfiguration,
   type McpConnection,
   type McpResources,
} from '@/lib/mcp';

export function useMcpSettings() {
   const gate = useRef(new SubmissionGate());
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [configuration, setConfiguration] = useState<McpConfiguration>();
   const [connections, setConnections] = useState<McpConnection[]>([]);
   const [resources, setResources] = useState<McpResources>({
      teams: [],
      projects: [],
      labels: [],
      truncated: false,
   });
   const [token, setToken] = useState<string>();
   const [loading, setLoading] = useState(true);
   const [canManage, setCanManage] = useState(false);
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState<string>();
   const [createdId, setCreatedId] = useState<string>();

   const refresh = useCallback(async (id: string) => {
      setConnections(await listMcpConnections(id));
   }, []);

   useEffect(() => {
      let cancelled = false;
      void Promise.all([loadCurrentWorkspaceMembership(), getMcpConfiguration()])
         .then(async ([membership, nextConfiguration]) => {
            const workspace = membership.workspace;
            if (cancelled) return;
            setWorkspaceId(workspace.id);
            setCanManage(membership.role === 'OWNER' || membership.role === 'ADMIN');
            setConfiguration(nextConfiguration);
            setResources(await getMcpResources(workspace.id));
            await refresh(workspace.id);
         })
         .catch((cause: unknown) => {
            if (!cancelled)
               setError(cause instanceof Error ? cause.message : 'Could not load MCP settings.');
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });
      return () => {
         cancelled = true;
      };
   }, [refresh]);

   /** Runs one mutation at a time and reports its outcome in a toast; resolves to true on success. */
   async function perform(operation: () => Promise<void>, success: string) {
      let succeeded = false;
      await gate.current.run(async () => {
         setBusy(true);
         try {
            await operation();
            succeeded = true;
            toast.success(success);
         } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : 'The operation failed.');
         } finally {
            setBusy(false);
         }
      });
      return succeeded;
   }

   async function create(draft: ConnectionDraft) {
      if (!workspaceId) return false;
      return perform(async () => {
         const result = await createMcpConnection(workspaceId, draft);
         setToken(result.token);
         setCreatedId(result.id);
         await refresh(workspaceId);
      }, `Connection "${draft.name.trim()}" created. Copy its token now.`);
   }

   async function update(connectionId: string, draft: Omit<ConnectionDraft, 'expiresInDays'>) {
      if (!workspaceId) return false;
      return perform(async () => {
         await updateMcpConnection(workspaceId, connectionId, draft);
         await refresh(workspaceId);
      }, `Connection "${draft.name.trim()}" updated. The token is unchanged.`);
   }

   async function revoke(connectionId: string) {
      if (!workspaceId) return false;
      return perform(async () => {
         await revokeMcpConnection(workspaceId, connectionId);
         setToken(undefined);
         await refresh(workspaceId);
      }, 'Connection revoked.');
   }

   return {
      configuration,
      workspaceId,
      canManage,
      resources,
      connections,
      token,
      createdId,
      loading,
      busy,
      error,
      create,
      update,
      revoke,
      dismissToken: () => setToken(undefined),
   };
}
