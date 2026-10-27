import { User } from '@/mock-data/users';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { useIssuesStore } from '@/store/issues-store';
import { toast } from 'sonner';
import { ApiRequestError, responseData } from '@/lib/http';
import { showDesktopNotification } from '@/features/notifications/desktop';
import { loadCurrentUser } from '@/features/identity/current-user';
import {
   notificationType,
   readableTime,
   contentFor,
   fallbackUser,
   entityFallback,
   type InboxItem,
   type NativeNotification,
} from '@/features/inbox/notification-data';
export type { InboxItem, NotificationType } from '@/features/inbox/notification-data';
import type { NotificationType } from '@/features/inbox/notification-data';
let notificationLoadEpoch = 0;
import { create } from 'zustand';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

interface NotificationsState {
   notifications: InboxItem[];
   selectedNotification: InboxItem | undefined;
   includeSnoozed: boolean;
   setIncludeSnoozed: (enabled: boolean) => void;
   snooze: (id: string, minutes: number | null) => Promise<void>;
   loading: boolean;
   error?: string;
   scope?: string;
   loadNotifications: () => Promise<void>;
   connectRealtime: (workspaceId: string) => () => void;
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
      const [workspace, user] = await Promise.all([loadCurrentWorkspace(), loadCurrentUser()]);
      const scope = `${user.id}/${workspace.id}`;
      if (get().scope !== scope) throw new Error('Reload notifications before changing them.');
      const separator = path.includes('?') ? '&' : '?';
      const response = await authenticatedFetch(
         `${api}/notifications${path}${separator}workspaceId=${encodeURIComponent(workspace.id)}`,
         init
      );
      if (!response.ok) {
         const body = (await response.json().catch(() => null)) as { message?: string } | null;
         throw new Error(body?.message ?? 'Could not update notifications.');
      }
      if (get().scope !== scope) throw new Error('Notification scope changed. Reload this view.');
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
      includeSnoozed: false,
      setIncludeSnoozed: (includeSnoozed) => {
         set({ includeSnoozed });
         void get().loadNotifications();
      },
      snooze: async (id, minutes) => {
         await request(`/${id}/snooze`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ minutes }),
         });
         await get().loadNotifications();
      },
      loading: false,
      loadNotifications: async () => {
         const epoch = ++notificationLoadEpoch;
         set({ loading: true, error: undefined });
         try {
            const [workspace, profileResponse] = await Promise.all([
               loadCurrentWorkspace(),
               authenticatedFetch(`${api}/users/me`),
            ]);
            const profile = await responseData<User>(profileResponse);
            if (epoch !== notificationLoadEpoch) return;
            const scope = `${profile.id}/${workspace.id}`;
            if (get().scope !== scope)
               set({ notifications: [], selectedNotification: undefined, scope });
            const native = await responseData<NativeNotification[]>(
               await authenticatedFetch(
                  `${api}/notifications?${new URLSearchParams({ workspaceId: workspace.id, includeSnoozed: String(get().includeSnoozed) })}`
               )
            );
            if (epoch !== notificationLoadEpoch || get().scope !== scope) return;
            const issuesById = new Map(
               useIssuesStore.getState().issues.map((issue) => [issue.id, issue])
            );
            const notifications = native.map((notification) => {
               const issue =
                  useIssuesStore.getState().accountId === profile.id &&
                  useIssuesStore.getState().workspaceId === workspace.id &&
                  notification.entityType === 'issue'
                     ? issuesById.get(notification.entityId)
                     : undefined;
               const actor = notification.data?.actor as Partial<User> | undefined;
               // Work an MCP agent did with a person's token names the agent next to them.
               // VI: Việc agent MCP làm bằng token của một người sẽ ghi tên agent cạnh người đó.
               const agent = notification.data?.agent as { name?: string } | undefined;
               return {
                  ...(issue ?? entityFallback(notification)),
                  id: notification.id,
                  content: contentFor(notification),
                  type: notificationType(notification.type),
                  user: {
                     ...fallbackUser(),
                     ...actor,
                     ...(agent?.name && actor?.name
                        ? { name: `${actor.name} · ${agent.name}` }
                        : {}),
                  } as User,
                  timestamp: readableTime(notification.createdAt),
                  notificationCreatedAt: notification.createdAt,
                  snoozedUntil: notification.snoozedUntil,
                  entityType: notification.entityType,
                  entityId: notification.entityId,
                  entityPath:
                     typeof notification.data?.entityPath === 'string'
                        ? notification.data.entityPath
                        : undefined,
                  read: Boolean(notification.readAt),
               };
            });
            const selectedId = get().selectedNotification?.id;
            set({
               notifications,
               selectedNotification: notifications.find((item) => item.id === selectedId),
               loading: false,
            });
         } catch (error) {
            if (epoch !== notificationLoadEpoch) return;
            const lostAccess =
               error instanceof ApiRequestError && [401, 403].includes(error.status);
            set({
               ...(lostAccess
                  ? { notifications: [], selectedNotification: undefined, scope: undefined }
                  : {}),
               loading: false,
               error: error instanceof Error ? error.message : 'Could not load notifications.',
            });
         }
      },
      connectRealtime: (workspaceId) => {
         if (typeof window === 'undefined') return () => undefined;
         let closed = false;
         let socket: WebSocket | undefined;
         let reconnectTimer: number | undefined;
         let heartbeatTimer: number | undefined;
         let attempt = 0;
         let connected = false;

         const connect = () => {
            const stream = new URL(`${api}/notifications/stream`);
            stream.protocol = stream.protocol === 'https:' ? 'wss:' : 'ws:';
            stream.searchParams.set('workspaceId', workspaceId);
            socket = new WebSocket(stream);
            socket.onopen = () => {
               attempt = 0;
               if (connected) void get().loadNotifications();
               connected = true;
               heartbeatTimer = window.setInterval(() => {
                  if (socket?.readyState === WebSocket.OPEN) socket.send('ping');
               }, 25_000);
            };
            socket.onmessage = (event) => {
               if (event.data === 'pong') return;
               try {
                  const payload = JSON.parse(event.data) as {
                     type?: string;
                     notification?: { id: string; userId: string; readAt?: string | null };
                  };
                  if (payload.type === 'notification.created') {
                     void get().loadNotifications();
                     if (payload.notification)
                        void showDesktopNotification(workspaceId, payload.notification);
                  }
               } catch {
                  // Ignore malformed data; the durable REST list remains the source of truth.
               }
            };
            socket.onclose = () => {
               if (heartbeatTimer) window.clearInterval(heartbeatTimer);
               if (!closed) {
                  const delay = Math.min(30_000, 1_000 * 2 ** attempt++);
                  reconnectTimer = window.setTimeout(connect, delay);
               }
            };
         };
         connect();
         return () => {
            closed = true;
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            if (heartbeatTimer) window.clearInterval(heartbeatTimer);
            socket?.close();
         };
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
