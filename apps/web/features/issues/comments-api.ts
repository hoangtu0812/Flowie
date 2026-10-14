import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import type { Attachment } from '@/lib/attachments';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
export type ActivityActor = { id: string; name: string; avatarUrl?: string | null } | null;
export type IssueActivity = {
   id: string;
   type: string;
   data?: Record<string, unknown>;
   createdAt: string;
   actor: ActivityActor;
};
export type IssueComment = {
   id: string;
   issueId: string;
   version: number;
   authorId: string;
   parentCommentId: string | null;
   mentionIds: string[];
   updatedAt: string;
   attachments: Attachment[];
   content: string;
   createdAt: string;
   author: NonNullable<ActivityActor>;
   reactions: Array<{ emoji: string; count: number; reacted: boolean }>;
};

async function data<T>(response: Response): Promise<T> {
   const payload = (await response.json().catch(() => null)) as {
      data: T;
      message?: string;
   } | null;
   if (!response.ok || !payload)
      throw new Error(payload?.message ?? 'Could not load issue activity.');
   return payload.data;
}

export async function loadIssueActivity(workspaceId: string, issueId: string) {
   const query = new URLSearchParams({ workspaceId, issueId });
   const [activities, comments] = await Promise.all([
      authenticatedFetch(`${api}/activities?${query}`).then(data<IssueActivity[]>),
      authenticatedFetch(`${api}/comments?${query}`).then(data<IssueComment[]>),
   ]);
   return { activities: activities.filter((item) => item.type !== 'comment.created'), comments };
}

export async function postIssueComment(
   workspaceId: string,
   issueId: string,
   content: string,
   options: { parentCommentId?: string; mentionIds?: string[]; clientRequestKey?: string } = {}
): Promise<IssueComment> {
   return data<IssueComment>(
      await authenticatedFetch(`${api}/comments`, {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, issueId, content, ...options }),
      })
   );
}

export async function commentRequest<T>(
   workspaceId: string,
   id: string,
   path = '',
   init?: RequestInit
): Promise<T> {
   return responseData<T>(
      await authenticatedFetch(
         `${api}/comments/${encodeURIComponent(id)}${path}?workspaceId=${encodeURIComponent(workspaceId)}`,
         init
      )
   );
}
export const editComment = (workspaceId: string, comment: IssueComment, content: string) =>
   commentRequest<IssueComment>(workspaceId, comment.id, '', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content, expectedVersion: comment.version }),
   });
export const removeComment = (workspaceId: string, id: string) =>
   commentRequest(workspaceId, id, '', { method: 'DELETE' });
export const commentHistory = (workspaceId: string, id: string) =>
   commentRequest<{ version: number; content: string; createdAt: string }[]>(
      workspaceId,
      id,
      '/revisions'
   );
export async function mentionOptions(workspaceId: string, issueId: string) {
   return responseData<{ id: string; name: string }[]>(
      await authenticatedFetch(
         `${api}/comments/mentions?${new URLSearchParams({ workspaceId, issueId })}`
      )
   );
}
