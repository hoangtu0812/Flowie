'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SubmissionGate } from '@/features/shared/submission-gate';
import { loadCurrentWorkspaceMembership } from '@/lib/workspaces';
import {
   createMcpConnection,
   getMcpConfiguration,
   getMcpResources,
   listMcpAudit,
   listMcpConnections,
   revokeMcpConnection,
   type ConnectionDraft,
   type McpAudit,
   type McpConfiguration,
   type McpConnection,
   type McpResources,
} from '@/lib/mcp';

export function useMcpSettings() {
   const gate = useRef(new SubmissionGate());
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [configuration, setConfiguration] = useState<McpConfiguration>();
   const [connections, setConnections] = useState<McpConnection[]>([]);
   const [audit, setAudit] = useState<McpAudit[]>([]);
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

   const refresh = useCallback(async (id: string) => {
      const [nextConnections, nextAudit] = await Promise.all([
         listMcpConnections(id),
         listMcpAudit(id),
      ]);
      setConnections(nextConnections);
      setAudit(nextAudit);
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

   function perform(operation: () => Promise<void>) {
      return gate.current.run(async () => {
         setBusy(true);
         setError(undefined);
         try {
            await operation();
         } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'The operation failed.');
         } finally {
            setBusy(false);
         }
      });
   }

   async function create(draft: ConnectionDraft) {
      if (!workspaceId) return;
      await perform(async () => {
         const result = await createMcpConnection(workspaceId, draft);
         setToken(result.token);
         await refresh(workspaceId);
      });
   }

   async function revoke(connectionId: string) {
      if (!workspaceId) return;
      await perform(async () => {
         await revokeMcpConnection(workspaceId, connectionId);
         setToken(undefined);
         await refresh(workspaceId);
      });
   }

   return {
      configuration,
      workspaceId,
      canManage,
      resources,
      connections,
      audit,
      token,
      loading,
      busy,
      error,
      create,
      revoke,
      dismissToken: () => setToken(undefined),
   };
}
