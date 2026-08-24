import { create } from 'zustand';
import { loadCurrentWorkspace } from '@/lib/workspaces';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type ApiNotification = {
   id: string;
   type: string;
   entityType: string;
   entityId: string;
   data: unknown;
   readAt: string | null;
   createdAt: string;
};

type NotificationActor = {
   id: string;
   name: string;
   avatarUrl: string | null;
};

type NotificationData = {
   title?: unknown;
   name?: unknown;
   identifier?: unknown;
   message?: unknown;
   actor?: unknown;
};

export type InboxNotification = {
   id: string;
   type: string;
   entityType: string;
   entityId: string;
   identifier: string;
   title: string;
   content: string;
   user: NotificationActor;
   timestamp: string;
   read: boolean;
   createdAt: string;
};

interface NotificationsState {
   notifications: InboxNotification[];
   selectedNotification: InboxNotification | undefined;
   isLoading: boolean;
   error?: string;
   loadNotifications: () => Promise<void>;
   setSelectedNotification: (notification: InboxNotification | undefined) => void;
   markAsRead: (id: string) => Promise<void>;
   markAllAsRead: () => Promise<void>;
   deleteAll: () => Promise<void>;
   deleteRead: () => Promise<void>;
   deleteCompletedIssues: () => Promise<void>;
   getUnreadNotifications: () => InboxNotification[];
   getReadNotifications: () => InboxNotification[];
   getNotificationsByType: (type: string) => InboxNotification[];
   getNotificationsByUser: (userId: string) => InboxNotification[];
   getNotificationById: (id: string) => InboxNotification | undefined;
   getUnreadCount: () => number;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
   typeof value === 'object' && value !== null;

const stringValue = (value: unknown) => (typeof value === 'string' ? value : undefined);

const actorFrom = (value: unknown): NotificationActor => {
   if (isRecord(value)) {
      const id = stringValue(value.id);
      const name = stringValue(value.name);
      const avatarUrl = stringValue(value.avatarUrl);
      if (id && name) return { id, name, avatarUrl: avatarUrl ?? null };
   }
   return { id: 'system', name: 'Flowie', avatarUrl: null };
};

const relativeTime = (value: string) => {
   const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
   const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
      ['year', 31_536_000],
      ['month', 2_592_000],
      ['week', 604_800],
      ['day', 86_400],
      ['hour', 3_600],
      ['minute', 60],
   ];
   const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
   for (const [unit, size] of units) {
      if (Math.abs(seconds) >= size) return formatter.format(Math.round(seconds / size), unit);
   }
   return 'just now';
};

const readableType = (type: string) => type.replaceAll('.', ' ');

const contentFrom = (type: string, data: NotificationData) => {
   const message = stringValue(data.message);
   if (message) return message;
   if (type === 'issue.created') return 'created this issue';
   if (type === 'project.created') return 'created this project';
   return readableType(type);
};

const toInboxNotification = (notification: ApiNotification): InboxNotification => {
   const data: NotificationData = isRecord(notification.data) ? notification.data : {};
   const identifier = stringValue(data.identifier) ?? notification.entityType.toUpperCase();
   const title =
      stringValue(data.title) ??
      stringValue(data.name) ??
      `${notification.entityType[0]?.toUpperCase() ?? ''}${notification.entityType.slice(1)}`;

   return {
      id: notification.id,
      type: notification.type.split('.').at(-1) ?? notification.type,
      entityType: notification.entityType,
      entityId: notification.entityId,
      identifier,
      title,
      content: contentFrom(notification.type, data),
      user: actorFrom(data.actor),
      timestamp: relativeTime(notification.createdAt),
      read: Boolean(notification.readAt),
      createdAt: notification.createdAt,
   };
};

const request = async (path: string, init?: RequestInit) => {
   const workspace = await loadCurrentWorkspace();
   const separator = path.includes('?') ? '&' : '?';
   const response = await fetch(
      `${api}${path}${separator}workspaceId=${encodeURIComponent(workspace.id)}`,
      { credentials: 'include', ...init }
   );
   if (!response.ok) throw new Error('Could not update notifications.');
   return response;
};

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
   notifications: [],
   selectedNotification: undefined,
   isLoading: false,
   error: undefined,

   loadNotifications: async () => {
      set({ isLoading: true, error: undefined });
      try {
         const response = await request('/notifications');
         const payload = (await response.json()) as { data: ApiNotification[] };
         const notifications = payload.data.map(toInboxNotification);
         const selectedId = get().selectedNotification?.id;
         set({
            notifications,
            selectedNotification: notifications.find(
               (notification) => notification.id === selectedId
            ),
            isLoading: false,
         });
      } catch (error) {
         set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Could not load notifications.',
         });
      }
   },

   setSelectedNotification: (notification) => set({ selectedNotification: notification }),

   markAsRead: async (id) => {
      try {
         await request(`/notifications/${id}/read`, { method: 'POST' });
         set((state) => ({
            notifications: state.notifications.map((notification) =>
               notification.id === id ? { ...notification, read: true } : notification
            ),
            selectedNotification:
               state.selectedNotification?.id === id
                  ? { ...state.selectedNotification, read: true }
                  : state.selectedNotification,
         }));
      } catch (error) {
         set({ error: error instanceof Error ? error.message : 'Could not update notification.' });
      }
   },

   markAllAsRead: async () => {
      try {
         await request('/notifications/read-all', { method: 'POST' });
         set((state) => ({
            notifications: state.notifications.map((notification) => ({
               ...notification,
               read: true,
            })),
            selectedNotification: state.selectedNotification
               ? { ...state.selectedNotification, read: true }
               : undefined,
         }));
      } catch (error) {
         set({ error: error instanceof Error ? error.message : 'Could not update notifications.' });
      }
   },

   deleteAll: async () => {
      try {
         await request('/notifications', { method: 'DELETE' });
         set({ notifications: [], selectedNotification: undefined });
      } catch (error) {
         set({ error: error instanceof Error ? error.message : 'Could not delete notifications.' });
      }
   },

   deleteRead: async () => {
      try {
         await request('/notifications/read', { method: 'DELETE' });
         set((state) => {
            const notifications = state.notifications.filter((notification) => !notification.read);
            return {
               notifications,
               selectedNotification: notifications.find(
                  (notification) => notification.id === state.selectedNotification?.id
               ),
            };
         });
      } catch (error) {
         set({ error: error instanceof Error ? error.message : 'Could not delete notifications.' });
      }
   },

   deleteCompletedIssues: async () => {
      try {
         await request('/notifications/completed-issues', { method: 'DELETE' });
         await get().loadNotifications();
      } catch (error) {
         set({ error: error instanceof Error ? error.message : 'Could not delete notifications.' });
      }
   },

   getUnreadNotifications: () => get().notifications.filter((notification) => !notification.read),
   getReadNotifications: () => get().notifications.filter((notification) => notification.read),
   getNotificationsByType: (type) =>
      get().notifications.filter((notification) => notification.type === type),
   getNotificationsByUser: (userId) =>
      get().notifications.filter((notification) => notification.user.id === userId),
   getNotificationById: (id) => get().notifications.find((notification) => notification.id === id),
   getUnreadCount: () => get().notifications.filter((notification) => !notification.read).length,
}));
