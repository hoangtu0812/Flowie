import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import type { LiveDocument } from '@/components/common/teams/use-live-team';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export type Revision = { version: number; title: string; actorId: string; createdAt: string };
export type RevisionDiff = {
   diff: string;
   fromTitle: string;
   toTitle: string;
   toVersion: number;
   truncated: boolean;
};
export async function documentRequest<T>(id: string, path = '', init?: RequestInit): Promise<T> {
   const workspace = await loadCurrentWorkspace();
   return responseData<T>(
      await authenticatedFetch(
         `${api}/documents/${encodeURIComponent(id)}${path}?workspaceId=${encodeURIComponent(workspace.id)}`,
         init
      )
   );
}
export const getDocument = (id: string) => documentRequest<LiveDocument>(id);
export const getRevisions = (id: string) =>
   documentRequest<{ items: Revision[]; limit: number }>(id, '/revisions');
export const getRevisionDiff = (id: string, version: number) =>
   documentRequest<RevisionDiff>(id, `/diff/${version}`);
export const restoreRevision = (id: string, version: number, expectedVersion: number) =>
   documentRequest<LiveDocument>(id, '/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ revisionVersion: version, expectedVersion }),
   });
