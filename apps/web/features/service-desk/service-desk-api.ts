import type { Attachment } from '@/lib/attachments';
import { responseData } from '@/lib/http';
import { authenticatedFetch } from '@/lib/workspaces';

export const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type TicketPriority = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TicketStatus =
   'received' | 'waiting_for_you' | 'in_progress' | 'done' | 'canceled' | 'declined';
export type Ticket = {
   id: string;
   teamId: string;
   projectId: string | null;
   title: string;
   description: string | null;
   priority: TicketPriority;
   identifier: string;
   status: 'open' | 'accepted' | 'declined' | 'resolved' | 'canceled';
   ticketStatus: TicketStatus;
   reopenPending?: boolean;
   createdAt: string;
   updatedAt: string;
   team: { id: string; name: string };
   project: { id: string; name: string } | null;
   createdBy: { id: string; name: string };
   assignee: { id: string; name: string } | null;
   /**
    * Present only in the team queue; "my tickets" never carries issue data.
    * VI: Chỉ có trong hàng đợi của team; "ticket của tôi" không bao giờ kèm dữ liệu Issue.
    */
   convertedIssue?: { id: string; identifier: string; title: string } | null;
};
export type TicketProject = { id: string; name: string; teamId: string };
export type TicketMessage = {
   id: string;
   content: string;
   createdAt: string;
   author: { id: string; name: string };
};
export type TicketDraft = {
   title: string;
   description: string | null;
   priority: TicketPriority;
};

const json = (method: string, body?: unknown): RequestInit => ({
   method,
   headers: { 'content-type': 'application/json' },
   body: body === undefined ? undefined : JSON.stringify(body),
});
const scoped = (workspaceId: string, extra: Record<string, string> = {}) =>
   new URLSearchParams({ workspaceId, ...extra });

export const listTickets = async (workspaceId: string, scope: 'mine' | 'team') =>
   responseData<Ticket[]>(
      await authenticatedFetch(`${api}/asks?${scoped(workspaceId, { scope })}`),
      'Could not load tickets.'
   );

export const listTicketProjects = async (workspaceId: string) =>
   responseData<TicketProject[]>(
      await authenticatedFetch(`${api}/asks/service-desk-projects?${scoped(workspaceId)}`),
      'Could not load projects.'
   );

export const createTicket = async (
   workspaceId: string,
   project: TicketProject,
   draft: TicketDraft
) =>
   responseData<Ticket>(
      await authenticatedFetch(
         `${api}/asks`,
         json('POST', { ...draft, workspaceId, teamId: project.teamId, projectId: project.id })
      ),
      'Could not create the ticket.'
   );

export const updateTicket = async (
   workspaceId: string,
   ticketId: string,
   changes: Partial<TicketDraft> & { assigneeId?: string | null }
) =>
   responseData<Ticket>(
      await authenticatedFetch(
         `${api}/asks/${ticketId}?${scoped(workspaceId)}`,
         json('PATCH', changes)
      ),
      'Could not update the ticket.'
   );

export type TicketAction = 'resolve' | 'decline' | 'reopen' | 'cancel';

export const transitionTicket = async (
   workspaceId: string,
   ticketId: string,
   action: TicketAction,
   message: string
) =>
   responseData<Ticket>(
      await authenticatedFetch(
         `${api}/asks/${ticketId}/transition?${scoped(workspaceId)}`,
         json('POST', { action, message })
      ),
      'Could not update the ticket.'
   );

export const convertTicket = async (workspaceId: string, ticketId: string) =>
   responseData<Ticket>(
      await authenticatedFetch(
         `${api}/asks/${ticketId}/convert?${scoped(workspaceId)}`,
         json('POST')
      ),
      'Could not convert the ticket.'
   );

export const archiveTicket = async (workspaceId: string, ticketId: string) =>
   responseData<unknown>(
      await authenticatedFetch(`${api}/asks/${ticketId}?${scoped(workspaceId)}`, json('DELETE')),
      'Could not archive the ticket.'
   );

export type TicketEmailChannels = {
   emailAvailable: boolean;
   emailEnabled: boolean;
   desktopEnabled: boolean;
   ticketEmailEnabled: boolean;
};

export const loadTicketEmail = async (workspaceId: string) =>
   responseData<TicketEmailChannels>(
      await authenticatedFetch(`${api}/notifications/channels?${scoped(workspaceId)}`),
      'Could not load email settings.'
   );

export const saveTicketEmail = async (
   workspaceId: string,
   { emailEnabled, desktopEnabled, ticketEmailEnabled }: TicketEmailChannels
) =>
   responseData<unknown>(
      await authenticatedFetch(
         `${api}/notifications/channels?${scoped(workspaceId)}`,
         json('PUT', { emailEnabled, desktopEnabled, ticketEmailEnabled })
      ),
      'Could not save email settings.'
   );

export type AutoJoin = {
   available: boolean;
   enabled: boolean;
   teamlessProjects: number;
   teamlessIssues: number;
   teamlessDocuments: number;
};

export const loadAutoJoin = async (workspaceId: string) =>
   responseData<AutoJoin>(
      await authenticatedFetch(`${api}/workspaces/${workspaceId}/auto-join`),
      'Could not load this setting.'
   );

export const saveAutoJoin = async (workspaceId: string, enabled: boolean) =>
   responseData<unknown>(
      await authenticatedFetch(
         `${api}/workspaces/${workspaceId}/auto-join`,
         json('PUT', { enabled })
      ),
      'Could not save this setting.'
   );

export const listTicketMessages = async (workspaceId: string, ticketId: string) =>
   responseData<TicketMessage[]>(
      await authenticatedFetch(`${api}/asks/${ticketId}/messages?${scoped(workspaceId)}`),
      'Could not load messages.'
   );

export const sendTicketMessage = async (workspaceId: string, ticketId: string, content: string) =>
   responseData<TicketMessage>(
      await authenticatedFetch(
         `${api}/asks/${ticketId}/messages?${scoped(workspaceId)}`,
         json('POST', { content })
      ),
      'Could not send the message.'
   );

export const listTicketFiles = async (workspaceId: string, ticketId: string) =>
   responseData<Attachment[]>(
      await authenticatedFetch(
         `${api}/attachments?${scoped(workspaceId, { entityType: 'ticket', entityId: ticketId })}`
      ),
      'Could not load attachments.'
   );

export const ticketForIssue = async (workspaceId: string, issueId: string) =>
   responseData<{ id: string; title: string } | null>(
      await authenticatedFetch(`${api}/asks/by-issue/${issueId}?${scoped(workspaceId)}`),
      'Could not load the ticket.'
   );

export type TicketNotification = { id: string; entityId: string };

/**
 * Unread ticket notifications, which mark tickets with news on the page without an Inbox.
 * VI: Thông báo ticket chưa đọc, dùng để đánh dấu ticket có tin mới trên trang không có Inbox.
 */
export const listUnreadTicketNotifications = async (workspaceId: string) => {
   const items = await responseData<
      (TicketNotification & { entityType: string; readAt: string | null })[]
   >(
      await authenticatedFetch(`${api}/notifications?${scoped(workspaceId)}`),
      'Could not load notifications.'
   );
   return items.filter((item) => item.entityType === 'ticket' && !item.readAt);
};

export const markNotificationRead = (id: string) =>
   authenticatedFetch(`${api}/notifications/${id}/read`, json('POST'));
