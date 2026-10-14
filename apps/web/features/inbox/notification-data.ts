import type { Issue } from '@/mock-data/issues';
import type { User } from '@/mock-data/users';
import { CircleDot } from 'lucide-react';
import { parseInstant } from '@/lib/time';

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
   entityType?: string;
   entityId: string;
   entityPath?: string;
   notificationCreatedAt?: string;
}

export type NativeNotification = {
   id: string;
   type: string;
   entityType: string;
   entityId: string;
   data?: Record<string, unknown>;
   readAt?: string | null;
   createdAt: string;
};

export function notificationType(value: string): NotificationType {
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

export function readableTime(value: string): string {
   const timestamp = parseInstant(value);
   if (Number.isNaN(timestamp.getTime())) return '';
   const minutes = Math.floor((Date.now() - timestamp.getTime()) / 60_000);
   if (minutes < 1) return 'now';
   if (minutes < 60) return `${minutes}m`;
   if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h`;
   if (minutes < 24 * 60 * 7) return `${Math.floor(minutes / (24 * 60))}d`;
   return timestamp.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function contentFor(notification: NativeNotification): string {
   const data = notification.data ?? {};
   if (typeof data.message === 'string') return data.message;
   if (notification.type === 'issue.reminder') return 'reminded you about this issue';
   if (typeof data.title === 'string')
      return `${notification.type.replaceAll('.', ' ')}: ${data.title}`;
   return notification.type.replaceAll('.', ' ');
}

export function fallbackUser(): User {
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

export function entityFallback(notification: NativeNotification): Issue {
   const title =
      typeof notification.data?.title === 'string'
         ? notification.data.title
         : notification.entityType === 'project'
           ? 'Project update'
           : 'Flowie notification';
   return {
      id: notification.entityId,
      identifier:
         typeof notification.data?.entityPath === 'string'
            ? (notification.data.entityPath.match(/\/issue\/([^/]+)/)?.[1] ?? 'FLOWIE')
            : notification.entityType === 'project'
              ? 'PROJECT'
              : 'FLOWIE',
      title,
      description: '',
      status: {
         id: 'notification',
         name: 'Notification',
         category: 'started',
         color: '#6b7280',
         icon: CircleDot,
      } as Issue['status'],
      assignee: null,
      priority: {
         id: 'no-priority',
         name: 'No priority',
         icon: CircleDot,
         color: 'currentColor',
      } as Issue['priority'],
      labels: [],
      createdAt: notification.createdAt,
      cycleId: '',
      rank: '',
   };
}
