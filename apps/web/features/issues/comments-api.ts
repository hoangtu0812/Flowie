import { authenticatedFetch } from '@/lib/workspaces';

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
   content: string
): Promise<IssueComment> {
   return data<IssueComment>(
      await authenticatedFetch(`${api}/comments`, {
         method: 'POST',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ workspaceId, issueId, content }),
      })
   );
}
