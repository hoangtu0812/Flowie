import { Issue } from '@/mock-data/issues';
import { User } from '@/mock-data/users';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { useIssuesStore } from '@/store/issues-store';
import { toast } from 'sonner';
import { create } from 'zustand';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type NotificationType =
   | 'comment'
   | 'mention'
   | 'assignment'
   | 'status'
   | 'reopened'
   | 'closed'
   | 'edited'
   | 'created'
   | 'upload'
   | 'reminder';

/** Presentation shape retained for the unchanged Circle Inbox markup. */
export interface InboxItem extends Issue {
   content: string;
   type: NotificationType;
   user: User;
   timestamp: string;
   read: boolean;
}

type NativeNotification = {
   id: string;
   type: string;
   entityType: string;
   entityId: string;
   data?: Record<string, unknown>;
   readAt?: string | null;
   createdAt: string;
};

function notificationType(value: string): NotificationType {
   if (value.includes('comment')) return 'comment';
   if (value.includes('mention')) return 'mention';
   if (value.includes('assignment')) return 'assignment';
   if (value.includes('status')) return 'status';
   if (value.includes('reopen')) return 'reopened';
   if (value.includes('close') || value.includes('complete')) return 'closed';
   if (value.includes('edit') || value.includes('update')) return 'edited';
   if (value.includes('upload') || value.includes('attachment')) return 'upload';
   if (value.includes('reminder')) return 'reminder';
   return 'created';
}

function readableTime(value: string): string {
   const timestamp = new Date(value);
   if (Number.isNaN(timestamp.getTime())) return '';
   const minutes = Math.floor((Date.now() - timestamp.getTime()) / 60_000);
   if (minutes < 1) return 'now';
   if (minutes < 60) return `${minutes}m`;
   if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
   if (minutes < 24 * 60 * 7) return `${Math.floor(minutes / (24 * 60))}d`;
   return timestamp.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function contentFor(notification: NativeNotification): string {
   const data = notification.data ?? {};
   if (typeof data.message === 'string') return data.message;
   if (notification.type === 'issue.reminder') return 'reminded you about this issue';
   if (typeof data.title === 'string')
      return `${notification.type.replaceAll('.', ' ')}: ${data.title}`;
   return notification.type.replaceAll('.', ' ');
}

function fallbackUser(): User {
   return {
      id: 'system',
      name: 'Flowie',
      avatarUrl: '',
      email: '',
      status: 'offline',
      role: 'Member',
      joinedDate: '',
      teamIds: [],
      timezone: 'UTC',
   };
}

interface NotificationsState {
   notifications: InboxItem[];
   selectedNotification: InboxItem | undefined;
   loading: boolean;
   loadNotifications: () => Promise<void>;
   setSelectedNotification: (notification: InboxItem | undefined) => void;
   markAsRead: (id: string) => Promise<void>;
   markAllAsRead: () => Promise<void>;
   markAsUnread: (id: string) => void;
   deleteAll: () => Promise<void>;
   deleteRead: () => Promise<void>;
   deleteCompletedIssues: () => Promise<void>;
   getUnreadNotifications: () => InboxItem[];
   getReadNotifications: () => InboxItem[];
   getNotificationsByType: (type: NotificationType) => InboxItem[];
   getNotificationsByUser: (userId: string) => InboxItem[];
   getNotificationById: (id: string) => InboxItem | undefined;
   getUnreadCount: () => number;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => {
   const request = async (path: string, init?: RequestInit) => {
      const workspace = await loadCurrentWorkspace();
      const separator = path.includes('?') ? '&' : '?';
      const response = await authenticatedFetch(
         `${api}/notifications${path}${separator}workspaceId=${encodeURIComponent(workspace.id)}`,
         init
      );
      if (!response.ok) {
         const body = (await response.json().catch(() => null)) as { message?: string } | null;
         throw new Error(body?.message ?? 'Could not update notifications.');
      }
      return response;
   };

   const updateItems = (apply: (item: InboxItem) => InboxItem | null) => {
      set((state) => {
         const notifications = state.notifications
            .map(apply)
            .filter((item): item is InboxItem => item !== null);
         const selected = state.selectedNotification
            ? (apply(state.selectedNotification) ?? undefined)
            : undefined;
         return { notifications, selectedNotification: selected };
      });
   };

   return {
      notifications: [],
      selectedNotification: undefined,
      loading: false,
      loadNotifications: async () => {
         set({ loading: true });
         try {
            const [response, profileResponse] = await Promise.all([
               request(''),
               authenticatedFetch(`${api}/users/me`),
            ]);
            const payload = (await response.json()) as { data: NativeNotification[] };
            const profile = profileResponse.ok
               ? ((await profileResponse.json()) as { data?: Partial<User> }).data
               : undefined;
            const actor = { ...fallbackUser(), ...profile } as User;
            const issuesById = new Map(
               useIssuesStore.getState().issues.map((issue) => [issue.id, issue])
            );
            const notifications = payload.data.flatMap((notification) => {
               const issue =
                  notification.entityType === 'issue'
                     ? issuesById.get(notification.entityId)
                     : undefined;
               if (!issue) return [];
               const dataActor = notification.data?.actor as Partial<User> | undefined;
               return [
                  {
                     ...issue,
                     id: notification.id,
                     content: contentFor(notification),
                     type: notificationType(notification.type),
                     user: dataActor?.id ? ({ ...actor, ...dataActor } as User) : actor,
                     timestamp: readableTime(notification.createdAt),
                     read: Boolean(notification.readAt),
                  },
               ];
            });
            set({ notifications, loading: false });
         } catch (error) {
            set({ notifications: [], selectedNotification: undefined, loading: false });
            toast.error(error instanceof Error ? error.message : 'Could not load notifications.');
         }
      },
      setSelectedNotification: (notification) => set({ selectedNotification: notification }),
      markAsRead: async (id) => {
         try {
            await request(`/${id}/read`, { method: 'POST' });
            updateItems((notification) =>
               notification.id === id ? { ...notification, read: true } : notification
            );
         } catch (error) {
            toast.error(
               error instanceof Error ? error.message : 'Could not mark notification as read.'
            );
         }
      },
      markAllAsRead: async () => {
         try {
            await request('/read-all', { method: 'POST' });
            updateItems((notification) => ({ ...notification, read: true }));
         } catch (error) {
            toast.error(
               error instanceof Error ? error.message : 'Could not mark notifications as read.'
            );
         }
      },
      markAsUnread: (id) =>
         updateItems((notification) =>
            notification.id === id ? { ...notification, read: false } : notification
         ),
      deleteAll: async () => {
         try {
            await request('', { method: 'DELETE' });
            set({ notifications: [], selectedNotification: undefined });
         } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Could not delete notifications.');
         }
      },
      deleteRead: async () => {
         try {
            await request('/read', { method: 'DELETE' });
            updateItems((notification) => (notification.read ? null : notification));
         } catch (error) {
            toast.error(
               error instanceof Error ? error.message : 'Could not delete read notifications.'
            );
         }
      },
      deleteCompletedIssues: async () => {
         try {
            await request('/completed-issues', { method: 'DELETE' });
            updateItems((notification) =>
               ['completed', 'canceled'].includes(notification.status.category)
                  ? null
                  : notification
            );
         } catch (error) {
            toast.error(
               error instanceof Error ? error.message : 'Could not delete completed notifications.'
            );
         }
      },
      getUnreadNotifications: () =>
         get().notifications.filter((notification) => !notification.read),
      getReadNotifications: () => get().notifications.filter((notification) => notification.read),
      getNotificationsByType: (type) =>
         get().notifications.filter((notification) => notification.type === type),
      getNotificationsByUser: (userId) =>
         get().notifications.filter((notification) => notification.user.id === userId),
      getNotificationById: (id) =>
         get().notifications.find((notification) => notification.id === id),
      getUnreadCount: () => get().notifications.filter((notification) => !notification.read).length,
   };
});
