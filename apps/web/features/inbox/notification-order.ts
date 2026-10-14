import { parseInstant } from '../../lib/time';

export function orderNotifications<T extends { read: boolean; notificationCreatedAt?: string }>(
   items: T[],
   newestFirst: boolean,
   unreadFirst: boolean
): T[] {
   const instant = (item: T) => {
      const value = item.notificationCreatedAt
         ? parseInstant(item.notificationCreatedAt).getTime()
         : 0;
      return Number.isFinite(value) ? value : 0;
   };
   return [...items].sort((a, b) => {
      if (unreadFirst && a.read !== b.read) return a.read ? 1 : -1;
      return newestFirst ? instant(b) - instant(a) : instant(a) - instant(b);
   });
}
