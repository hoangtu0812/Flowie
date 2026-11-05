'use client';

import { Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { FlowieLogo } from '@/components/brand/flowie-logo';
import { LoadingState } from '@/components/common/loading-state';
import { QueryState } from '@/components/common/query-state';
import { Button } from '@/components/ui/button';
import { accountPreferences } from '@/features/identity/account-preferences';
import { loadCurrentUser } from '@/features/identity/current-user';
import { PreferenceSync } from '@/features/identity/preference-sync';
import { useMessages } from '@/features/shared/use-messages';
import { useIsMobile } from '@/hooks/use-mobile';
import { loadWorkspaceMemberships, type WorkspaceSummary } from '@/lib/workspaces';
import { messages } from './messages.vi';
import {
   api,
   listTicketProjects,
   listTickets,
   listUnreadTicketNotifications,
   markNotificationRead,
   type Ticket,
   type TicketNotification,
   type TicketProject,
} from './service-desk-api';
import { TicketDetail } from './ticket-detail';
import { TicketDialog } from './ticket-dialog';
import { TicketEmailSwitch } from './ticket-email-switch';
import { useSelectedTicket } from './use-selected-ticket';
import { inState, TicketList, TicketStateSelect, type TicketState } from './ticket-list';

type Desk = { tickets: Ticket[]; projects: TicketProject[] };

/**
 * Service Desk for people who only raise tickets, outside the workspace shell, so there is no
 * sidebar and no workspace in the URL: every call passes the workspace id. The workspace comes
 * from `?workspace=`, then the saved default, then the only membership; otherwise the person
 * picks one. Without an Inbox here, unread ticket notifications mark tickets with news, and data
 * reloads when the tab regains focus.
 * VI: Service Desk cho người chỉ tạo ticket, nằm ngoài khung workspace, nên không có sidebar và
 * VI: không có workspace trên URL: mọi lời gọi đều truyền id workspace. Workspace lấy từ
 * VI: `?workspace=`, rồi workspace mặc định, rồi workspace duy nhất; còn lại thì người dùng tự
 * VI: chọn. Trang không có Inbox nên thông báo ticket chưa đọc đánh dấu ticket có tin mới, và dữ
 * VI: liệu tải lại khi tab được mở lại.
 */
export function ServiceDeskPortal() {
   const tx = useMessages(messages);
   const isMobile = useIsMobile();
   const router = useRouter();
   const wanted = useSearchParams().get('workspace');
   const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>();
   const [workspace, setWorkspace] = useState<WorkspaceSummary>();
   const [userName, setUserName] = useState<string>();
   const [desk, setDesk] = useState<Desk>();
   const [unread, setUnread] = useState<TicketNotification[]>([]);
   const [error, setError] = useState<string>();
   const [notice, setNotice] = useState<string>();
   const [selected, setSelected] = useSelectedTicket('/servicedesk');
   const [ticketState, setTicketState] = useState<TicketState>('open');
   const [dialog, setDialog] = useState<'new' | 'edit'>();

   const open = useCallback(async () => {
      setError(undefined);
      try {
         const [user, memberships] = await Promise.all([
            loadCurrentUser(),
            loadWorkspaceMemberships(),
         ]);
         if (memberships.length === 0) {
            router.replace('/');
            return;
         }
         const { defaultWorkspaceId } = await accountPreferences(user.id);
         const list = memberships.map((membership) => membership.workspace);
         setUserName(user.name);
         setWorkspaces(list);
         setWorkspace(
            list.find((item) => item.slug === wanted || item.id === wanted) ??
               list.find((item) => item.id === defaultWorkspaceId) ??
               (list.length === 1 ? list[0] : undefined)
         );
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not open Service Desk.');
      }
   }, [router, wanted]);
   useEffect(() => void open(), [open]);

   const workspaceId = workspace?.id;
   const load = useCallback(async () => {
      if (!workspaceId) return;
      try {
         const [tickets, projects, notifications] = await Promise.all([
            listTickets(workspaceId, 'mine'),
            listTicketProjects(workspaceId),
            listUnreadTicketNotifications(workspaceId),
         ]);
         setDesk({ tickets, projects });
         setUnread(notifications);
         setError(undefined);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not load tickets.');
      }
   }, [workspaceId]);
   useEffect(() => {
      void load();
      const refresh = () => void load();
      window.addEventListener('focus', refresh);
      return () => window.removeEventListener('focus', refresh);
   }, [load]);

   // Opening a ticket is reading it, so its dot clears here as it does in the Inbox.
   // VI: Mở ticket nghĩa là đã đọc, nên chấm tin mới được xoá giống như trong Inbox.
   useEffect(() => {
      const read = unread.filter((item) => item.entityId === selected);
      if (read.length === 0) return;
      setUnread((items) => items.filter((item) => item.entityId !== selected));
      read.forEach((item) => void markNotificationRead(item.id).catch(() => undefined));
   }, [selected, unread]);

   const unreadTickets = useMemo(() => new Set(unread.map((item) => item.entityId)), [unread]);
   const ticket = desk?.tickets.find((item) => item.id === selected);
   const rows = desk?.tickets.filter((item) => inState(item, ticketState)) ?? [];

   const signOut = async () => {
      await fetch(`${api}/auth/logout`, { method: 'POST', credentials: 'include' });
      router.replace('/auth/login');
      router.refresh();
   };

   const list = (
      <VStack className="h-full min-h-0 w-full">
         <HStack gap={2} className="h-10 shrink-0 items-center border-b px-4">
            <Text type="label" className="flex-1">
               {tx('My tickets ({count})', { count: desk?.tickets.length ?? 0 })}
            </Text>
            <Button type="button" size="sm" disabled={!desk} onClick={() => setDialog('new')}>
               <Plus className="size-3.5" />
               {tx('New ticket')}
            </Button>
         </HStack>
         <div className="shrink-0 p-2">
            <TicketStateSelect value={ticketState} onChange={setTicketState} />
         </div>
         {notice && (
            <p role="alert" className="shrink-0 p-4 text-sm text-destructive">
               {notice}
            </p>
         )}
         <VStack className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {!desk && !error && <LoadingState />}
            {desk && rows.length === 0 && (
               <Text type="supporting" className="p-4 text-center">
                  {tx(
                     desk.tickets.length === 0
                        ? 'You have no tickets yet.'
                        : 'No tickets in this view.'
                  )}
               </Text>
            )}
            <TicketList
               rows={rows}
               selected={selected}
               inQueue={false}
               unread={unreadTickets}
               onSelect={setSelected}
            />
         </VStack>
         {workspaceId && <TicketEmailSwitch workspaceId={workspaceId} />}
      </VStack>
   );

   const detail =
      workspaceId && ticket ? (
         <TicketDetail
            key={ticket.id}
            workspaceId={workspaceId}
            ticket={ticket}
            canHandle={false}
            members={[]}
            onChanged={load}
            onClose={() => setSelected(undefined)}
            onEdit={() => setDialog('edit')}
            onArchived={() => {
               setSelected(undefined);
               void load();
            }}
         />
      ) : (
         <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
            {tx('Select a ticket to read it.')}
         </div>
      );

   const picker = workspaces && !workspace && (
      <VStack gap={3} className="mx-auto w-full max-w-sm p-6">
         <Text type="label">{tx('Choose a workspace')}</Text>
         {workspaces.map((item) => (
            <Button
               key={item.id}
               type="button"
               variant="outline"
               onClick={() => setWorkspace(item)}
            >
               {item.name}
            </Button>
         ))}
      </VStack>
   );

   return (
      <div className="flex h-svh flex-col bg-background">
         <PreferenceSync />
         <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-container px-4">
            <FlowieLogo />
            <Text type="label" className="min-w-0 truncate">
               {tx('Service Desk')}
            </Text>
            {workspace && (
               <Text type="supporting" className="hidden min-w-0 truncate sm:block">
                  {workspace.name}
               </Text>
            )}
            <div className="ml-auto flex shrink-0 items-center gap-2">
               {userName && (
                  <Text type="supporting" className="hidden sm:block">
                     {userName}
                  </Text>
               )}
               {workspace && (
                  <Button asChild variant="ghost" size="sm">
                     <Link href={`/${workspace.slug}/inbox`}>{tx('Open Flowie')}</Link>
                  </Button>
               )}
               <Button type="button" variant="ghost" size="sm" onClick={() => void signOut()}>
                  {tx('Sign out')}
               </Button>
            </div>
         </header>
         <main className="min-h-0 flex-1">
            {error && !desk ? (
               <QueryState message={error} onRetry={() => void (workspace ? load() : open())} />
            ) : !workspaces ? (
               <LoadingState />
            ) : (
               picker ||
               (isMobile ? (
                  ticket ? (
                     detail
                  ) : (
                     list
                  )
               ) : (
                  <HStack className="h-full w-full overflow-hidden">
                     <VStack className="h-full w-[380px] max-w-[46%] shrink-0 border-r bg-container">
                        {list}
                     </VStack>
                     <VStack className="h-full min-w-0 flex-1 bg-container">{detail}</VStack>
                  </HStack>
               ))
            )}
         </main>
         {workspaceId && desk && dialog && (
            <TicketDialog
               workspaceId={workspaceId}
               projects={desk.projects}
               ticket={dialog === 'edit' ? ticket : undefined}
               onClose={() => setDialog(undefined)}
               onSaved={(id, uploadError) => {
                  setDialog(undefined);
                  setSelected(id);
                  setNotice(uploadError);
                  void load();
               }}
            />
         )}
      </div>
   );
}
