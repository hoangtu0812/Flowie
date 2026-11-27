import { responseData } from '@/lib/http';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import type { DocumentCommentAnchor } from '@/lib/document-comment-anchor';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type DocumentComment = {
   id: string;
   parentId: string | null;
   anchor: DocumentCommentAnchor | null;
   content: string;
   mentionIds: string[];
   resolvedAt: string | null;
   resolvedBy: { id: string; name: string } | null;
   createdAt: string;
   updatedAt: string;
   author: { id: string; name: string; avatarUrl?: string | null };
   mine: boolean;
};

/** Writes return the document's whole comment list. VI: Thao tác ghi trả về toàn bộ comment của tài liệu. */
async function send<T>(documentId: string, path = '', init?: { method: string; body?: unknown }) {
   const workspace = await loadCurrentWorkspace();
   return responseData<T>(
      await authenticatedFetch(
         `${api}/documents/${documentId}/comments${path}?${new URLSearchParams({ workspaceId: workspace.id })}`,
         init && {
            method: init.method,
            headers: init.body ? { 'content-type': 'application/json' } : undefined,
            body: init.body ? JSON.stringify(init.body) : undefined,
         }
      )
   );
}

export const loadDocumentComments = (documentId: string) => send<DocumentComment[]>(documentId);

export const documentMentionOptions = (documentId: string) =>
   send<{ id: string; name: string; avatarUrl?: string | null }[]>(documentId, '/mentions');

export const createDocumentComment = (
   documentId: string,
   body: {
      content: string;
      mentionIds: string[];
      parentId?: string;
      anchor?: DocumentCommentAnchor;
   }
) => send<DocumentComment[]>(documentId, '', { method: 'POST', body });

export const updateDocumentComment = (
   documentId: string,
   commentId: string,
   body: { content?: string; mentionIds?: string[]; resolved?: boolean }
) => send<DocumentComment[]>(documentId, `/${commentId}`, { method: 'PATCH', body });

export const deleteDocumentComment = (documentId: string, commentId: string) =>
   send<DocumentComment[]>(documentId, `/${commentId}`, { method: 'DELETE' });
