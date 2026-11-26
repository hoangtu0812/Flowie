'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SubmissionGate } from '@/features/shared/submission-gate';
import { useMessages } from '@/features/shared/use-messages';
import { loadCurrentWorkspaceMembership } from '@/lib/workspaces';
import { parseInstant } from '@/lib/time';
import {
   createApiKey,
   deleteApiKey,
   listApiKeys,
   revokeApiKey,
   type ApiKey,
   type ApiKeyDraft,
} from '@/lib/api-keys';
import { messages } from './messages.vi';

export const isInactive = (key: ApiKey) =>
   Boolean(key.revokedAt) || parseInstant(key.expiresAt).getTime() < Date.now();

/** Loads the workspace's API keys for owners and admins and runs one mutation at a time. */
/** VI: Tải API key của workspace cho owner/admin và chạy từng thao tác một. */
export function useApiKeys() {
   const tx = useMessages(messages);
   const gate = useRef(new SubmissionGate());
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [canManage, setCanManage] = useState(false);
   const [keys, setKeys] = useState<ApiKey[]>([]);
   const [scopes, setScopes] = useState<string[]>([]);
   const [token, setToken] = useState<string>();
   const [loading, setLoading] = useState(true);
   const [busy, setBusy] = useState(false);
   const [error, setError] = useState<string>();

   const refresh = useCallback(async (id: string) => {
      const loaded = await listApiKeys(id);
      setKeys(loaded.keys);
      setScopes(loaded.scopes);
   }, []);

   useEffect(() => {
      let cancelled = false;
      void loadCurrentWorkspaceMembership()
         .then(async (membership) => {
            if (cancelled) return;
            const manager = membership.role === 'OWNER' || membership.role === 'ADMIN';
            setWorkspaceId(membership.workspace.id);
            setCanManage(manager);
            if (manager) await refresh(membership.workspace.id);
         })
         .catch((cause: unknown) => {
            if (!cancelled)
               setError(cause instanceof Error ? cause.message : 'Could not load API keys.');
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });
      return () => {
         cancelled = true;
      };
   }, [refresh]);

   async function perform(operation: (id: string) => Promise<void>, success: string) {
      let succeeded = false;
      if (!workspaceId) return succeeded;
      await gate.current.run(async () => {
         setBusy(true);
         try {
            await operation(workspaceId);
            await refresh(workspaceId);
            succeeded = true;
            toast.success(success);
         } catch (cause) {
            toast.error(cause instanceof Error ? cause.message : tx('The operation failed.'));
         } finally {
            setBusy(false);
         }
      });
      return succeeded;
   }

   return {
      canManage,
      keys,
      scopes,
      token,
      loading,
      busy,
      error,
      create: (draft: ApiKeyDraft) =>
         perform(
            async (id) => {
               setToken((await createApiKey(id, draft)).token);
            },
            tx('API key "{name}" created. Copy it now.', { name: draft.name.trim() })
         ),
      revoke: (keyId: string) =>
         perform(async (id) => {
            await revokeApiKey(id, keyId);
            setToken(undefined);
         }, tx('API key revoked.')),
      remove: (keyId: string) =>
         perform((id) => deleteApiKey(id, keyId).then(() => undefined), tx('API key deleted.')),
      dismissToken: () => setToken(undefined),
   };
}
