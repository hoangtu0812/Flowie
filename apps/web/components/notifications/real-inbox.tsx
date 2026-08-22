'use client';

import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { CheckCheck, CircleDot, MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Notification = {
   id: string;
   type: string;
   entityType: string;
   entityId: string;
   data: unknown;
   readAt: string | null;
   createdAt: string;
};
const describe = (notification: Notification) => {
   if (
      notification.data &&
      typeof notification.data === 'object' &&
      'message' in notification.data
   ) {
      const message = (notification.data as { message?: unknown }).message;
      if (typeof message === 'string') return message;
   }
   return notification.type.replaceAll('.', ' ');
};
const dateLabel = (value: string) =>
   new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value)
   );

export function RealInbox() {
   const [notifications, setNotifications] = useState<Notification[]>([]);
   const [selected, setSelected] = useState<Notification>();
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [showRead, setShowRead] = useState(true);
   const [unreadFirst, setUnreadFirst] = useState(false);
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
      if (
         (await fetch(`${api}/notifications/read-all`, { method: 'POST', credentials: 'include' }))
            .ok
      )
         await load();
   };
   const markRead = async (id: string) => {
      if (
         (
            await fetch(`${api}/notifications/${id}/read`, {
               method: 'POST',
               credentials: 'include',
            })
         ).ok
      )
         await load();
   };
   const displayed = useMemo(
      () =>
         notifications
            .filter((notification) => showRead || !notification.readAt)
            .sort((left, right) =>
               unreadFirst && Boolean(left.readAt) !== Boolean(right.readAt)
                  ? Number(Boolean(left.readAt)) - Number(Boolean(right.readAt))
                  : new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
            ),
      [notifications, showRead, unreadFirst]
   );
   const unread = notifications.filter((notification) => !notification.readAt).length;
   return (
      <ResizablePanelGroup
         direction="horizontal"
         autoSaveId="inbox-panel-group"
         className="h-full w-full"
      >
         <ResizablePanel defaultSize={40} minSize={28}>
            <div className="flex h-full flex-col">
               <div className="flex h-10 items-center justify-between border-b border-border px-4">
                  <div className="flex items-center gap-2">
                     <SidebarTrigger className="inline-flex lg:hidden" />
                     <h2 className="text-lg font-semibold">Inbox</h2>
                  </div>
                  <div className="flex items-center gap-1">
                     <Button
                        variant={showRead ? 'ghost' : 'secondary'}
                        size="icon"
                        className="size-7"
                        onClick={() => setShowRead((value) => !value)}
                        aria-label="Toggle read notifications"
                     >
                        <SlidersHorizontal className="size-4" />
                     </Button>
                     <Button
                        variant="ghost"
                        size="icon"
                        className="size-7"
                        onClick={() => void markAllRead()}
                        disabled={!unread}
                        aria-label="Mark all as read"
                     >
                        <CheckCheck className="size-4" />
                     </Button>
                  </div>
               </div>
               <div className="border-b px-4 py-1.5">
                  <Button
                     size="xs"
                     variant={unreadFirst ? 'secondary' : 'ghost'}
                     onClick={() => setUnreadFirst((value) => !value)}
                  >
                     Unread first
                  </Button>
               </div>
               <div className="min-h-0 flex-1 overflow-y-auto">
                  {state === 'loading' && (
                     <p className="p-4 text-sm text-muted-foreground">Loading notifications…</p>
                  )}
                  {state === 'error' && (
                     <p className="p-4 text-sm text-destructive">Could not load notifications.</p>
                  )}
                  {state === 'ready' && displayed.length === 0 && (
                     <p className="p-6 text-center text-sm text-muted-foreground">
                        No notifications here.
                     </p>
                  )}
                  {displayed.map((notification) => (
                     <button
                        key={notification.id}
                        type="button"
                        onClick={() => {
                           setSelected(notification);
                           if (!notification.readAt) void markRead(notification.id);
                        }}
                        className={`flex w-full items-start gap-3 border-b px-4 py-3 text-left hover:bg-sidebar/50 ${selected?.id === notification.id ? 'bg-accent/50' : ''}`}
                     >
                        <CircleDot
                           className={`mt-0.5 size-4 shrink-0 ${notification.readAt ? 'text-muted-foreground/40' : 'text-primary'}`}
                        />
                        <span className="min-w-0 flex-1">
                           <span className="block truncate text-sm font-medium">
                              {describe(notification)}
                           </span>
                           <time className="mt-1 block text-xs text-muted-foreground">
                              {dateLabel(notification.createdAt)}
                           </time>
                        </span>
                     </button>
                  ))}
               </div>
            </div>
         </ResizablePanel>
         <ResizableHandle withHandle />
         <ResizablePanel defaultSize={60}>
            <div className="flex h-full flex-col">
               <div className="flex h-10 items-center border-b px-6">
                  <MoreHorizontal className="size-4 text-muted-foreground" />
               </div>
               {selected ? (
                  <article className="max-w-3xl space-y-4 p-6">
                     <div>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">
                           {selected.entityType}
                        </p>
                        <h1 className="mt-1 text-xl font-semibold">{describe(selected)}</h1>
                     </div>
                     <dl className="space-y-2 text-sm">
                        <div className="flex gap-3">
                           <dt className="w-28 text-muted-foreground">Activity</dt>
                           <dd>{selected.type}</dd>
                        </div>
                        <div className="flex gap-3">
                           <dt className="w-28 text-muted-foreground">Received</dt>
                           <dd>{dateLabel(selected.createdAt)}</dd>
                        </div>
                        <div className="flex gap-3">
                           <dt className="w-28 text-muted-foreground">Status</dt>
                           <dd>{selected.readAt ? 'Read' : 'Unread'}</dd>
                        </div>
                     </dl>
                  </article>
               ) : (
                  <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                     Select a notification to preview it.
                  </div>
               )}
            </div>
         </ResizablePanel>
      </ResizablePanelGroup>
   );
}
