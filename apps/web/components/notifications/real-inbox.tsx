'use client';

import { useCallback, useEffect, useState } from 'react';

type Notification = {
   id: string;
   type: string;
   entityType: string;
   entityId: string;
   data: unknown;
   readAt: string | null;
   createdAt: string;
};

function describe(notification: Notification) {
   if (
      notification.data &&
      typeof notification.data === 'object' &&
      'message' in notification.data
   ) {
      const message = (notification.data as { message?: unknown }).message;
      if (typeof message === 'string') return message;
   }
   return notification.type.replaceAll('.', ' ');
}

export function RealInbox() {
   const [notifications, setNotifications] = useState<Notification[]>([]);
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
   const load = useCallback(async () => {
      const response = await fetch(`${api}/notifications`, { credentials: 'include' });
      if (!response.ok) throw new Error('Could not load notifications.');
      setNotifications(((await response.json()) as { data: Notification[] }).data);
   }, [api]);
   useEffect(() => {
      void load()
         .then(() => setState('ready'))
         .catch(() => setState('error'));
   }, [load]);
   const markAllRead = async () => {
      const response = await fetch(`${api}/notifications/read-all`, {
         method: 'POST',
         credentials: 'include',
      });
      if (response.ok) await load();
   };
   const markRead = async (id: string) => {
      const response = await fetch(`${api}/notifications/${id}/read`, {
         method: 'POST',
         credentials: 'include',
      });
      if (response.ok) await load();
   };
   const unread = notifications.filter((notification) => !notification.readAt).length;
   return (
      <section className="mx-auto w-full max-w-4xl p-4 sm:p-6">
         <div className="mb-6 flex items-center justify-between gap-4">
            <div>
               <h1 className="text-xl font-semibold">Inbox</h1>
               <p className="mt-1 text-sm text-muted-foreground">
                  {unread ? `${unread} unread notifications` : 'You are all caught up.'}
               </p>
            </div>
            <button
               className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
               disabled={!unread}
               onClick={() => void markAllRead()}
               type="button"
            >
               Mark all read
            </button>
         </div>
         {state === 'loading' ? (
            <p className="text-sm text-muted-foreground">Loading notifications…</p>
         ) : state === 'error' ? (
            <p className="text-sm text-destructive">Could not load notifications.</p>
         ) : !notifications.length ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
               No notifications yet.
            </div>
         ) : (
            <div className="overflow-hidden rounded-md border">
               {notifications.map((notification) => (
                  <button
                     className={`flex w-full items-center gap-3 border-b px-4 py-3 text-left last:border-0 ${notification.readAt ? 'opacity-60' : ''}`}
                     key={notification.id}
                     onClick={() => !notification.readAt && void markRead(notification.id)}
                     type="button"
                  >
                     <span
                        className={`h-2.5 w-2.5 rounded-full ${notification.readAt ? 'bg-muted' : 'bg-primary'}`}
                     />
                     <span className="min-w-0 flex-1 truncate text-sm">
                        {describe(notification)}
                     </span>
                     <time className="text-xs text-muted-foreground">
                        {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(
                           new Date(notification.createdAt)
                        )}
                     </time>
                  </button>
               ))}
            </div>
         )}
      </section>
   );
}
