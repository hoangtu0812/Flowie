'use client';

import { Plus } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { LoadingState } from '@/components/common/loading-state';
import { QueryState } from '@/components/common/query-state';
import {
   loadCurrentWorkspaceTeams,
   type WorkspaceTeam,
} from '@/components/common/teams/team-types';
import { Button } from '@/components/ui/button';
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { useMessages } from '@/features/shared/use-messages';
import { useIsMobile } from '@/hooks/use-mobile';
import { loadCurrentWorkspaceMembership } from '@/lib/workspaces';
import { ServiceDeskAssistant, useAssistantStatus } from './assistant';
import type { TicketPrefill } from './assistant-draft';
import { messages } from './messages.vi';
import {
   listTicketProjects,
   listTickets,
   type Ticket,
   type TicketProject,
} from './service-desk-api';
import { TicketDetail } from './ticket-detail';
import { TicketDialog } from './ticket-dialog';
import { useSelectedTicket } from './use-selected-ticket';
import { useTicketUpdates } from './use-ticket-updates';
import { inState, isOpen, TicketList, TicketStateSelect, type TicketState } from './ticket-list';
import { isRequester } from './requester';

type DeskData = {
   workspaceId: string;
   teams: WorkspaceTeam[];
   inTeam: boolean;
   mine: Ticket[];
   queue: Ticket[];
   projects: TicketProject[];
};
const ALL_PROJECTS = 'all';

/**
 * Tickets beside the one being read, as in Approvals. Everyone has "my tickets"; only people in a
 * team get the queue, so requesters never request team data. On a narrow screen the ticket
 * replaces the list until it is closed. An Inbox link selects its ticket through the route.
 * VI: Danh sách ticket cạnh ticket đang đọc, giống trang Phê duyệt. Ai cũng có "ticket của tôi";
 * VI: chỉ người thuộc team mới có hàng đợi, nên người yêu cầu không gọi dữ liệu của team. Trên
 * VI: màn hình hẹp, ticket thay chỗ danh sách cho tới khi đóng. Liên kết Inbox chọn ticket qua route.
 */
export function ServiceDeskPage() {
   const tx = useMessages(messages);
   const router = useRouter();
   const isMobile = useIsMobile();
   const { orgId, ticketId } = useParams<{ orgId: string; ticketId?: string[] }>();
   const [data, setData] = useState<DeskData>();
   const [loadError, setLoadError] = useState<string>();
   const [notice, setNotice] = useState<string>();
   const [tab, setTab] = useState<'mine' | 'queue'>('mine');
   const [selected, setSelected] = useSelectedTicket(`/${orgId}/service-desk`);
   const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS);
   const [ticketState, setTicketState] = useState<TicketState>('open');
   const [dialog, setDialog] = useState<'new' | 'edit'>();
   const [draft, setDraft] = useState<TicketPrefill>();
   const [asking, setAsking] = useState(false);

   const load = useCallback(async () => {
      try {
         const membership = await loadCurrentWorkspaceMembership();
         if (await isRequester(membership)) {
            const ticket = ticketId?.[0] ? `/${ticketId[0]}` : '';
            router.replace(`/servicedesk${ticket}?workspace=${membership.workspace.slug}`);
            return;
         }
         const { workspaceId, teams } = await loadCurrentWorkspaceTeams();
         const inTeam = teams.some((team) => team.joined);
         const [mine, queue, projects] = await Promise.all([
            listTickets(workspaceId, 'mine'),
            inTeam ? listTickets(workspaceId, 'team') : [],
            listTicketProjects(workspaceId),
         ]);
         setData({ workspaceId, teams, inTeam, mine, queue, projects });
         setLoadError(undefined);
      } catch (caught) {
         setLoadError(caught instanceof Error ? caught.message : 'Could not load tickets.');
      }
   }, [router, ticketId]);
   useEffect(() => void load(), [load]);
   useTicketUpdates(data?.workspaceId, load);
   const assistant = useAssistantStatus(data?.workspaceId);
   const newTicket = (prefill?: TicketPrefill) => {
      setDraft(prefill);
      setDialog('new');
   };

   // Follows a ticket opened from the Inbox or a link into its tab. It runs once per ticket, so
   // later reloads cannot pull someone back from the tab they moved to.
   // VI: Chuyển sang tab chứa ticket được mở từ Inbox hoặc link. Chỉ chạy một lần cho mỗi ticket,
   // VI: để các lần tải lại sau không kéo người dùng về lại tab khác.
   const followedTicket = useRef<string | undefined>(undefined);
   useEffect(() => {
      if (!data || !selected || followedTicket.current === selected) return;
      followedTicket.current = selected;
      const mine = data.mine.some((item) => item.id === selected);
      const queued = data.queue.some((item) => item.id === selected);
      if (mine !== queued) setTab(mine ? 'mine' : 'queue');
   }, [data, selected]);

   const queueProjects = useMemo(() => {
      const named = (data?.queue ?? []).flatMap((ticket) =>
         ticket.project ? [ticket.project] : []
      );
      return [...new Map(named.map((project) => [project.id, project])).values()];
   }, [data]);
   const rows = (tab === 'mine' ? (data?.mine ?? []) : (data?.queue ?? [])).filter(
      (ticket) =>
         inState(ticket, ticketState) &&
         (tab === 'mine' || projectFilter === ALL_PROJECTS || ticket.projectId === projectFilter)
   );
   const queued = data?.queue.find((ticket) => ticket.id === selected);
   const ticket = queued ?? data?.mine.find((item) => item.id === selected);

   const list = (
      <VStack className="h-full min-h-0 w-full">
         <HStack gap={2} className="h-10 shrink-0 items-center border-b px-4">
            <SidebarTrigger className="inline-flex lg:hidden" />
            <Text type="label" className="flex-1">
               {tx('Service Desk')}
            </Text>
            {isMobile && assistant && tab === 'mine' && (
               <Button type="button" size="sm" variant="outline" onClick={() => setAsking(true)}>
                  {tx('Ask the assistant')}
               </Button>
            )}
            <Button type="button" size="sm" disabled={!data} onClick={() => newTicket()}>
               <Plus className="size-3.5" />
               {tx('New ticket')}
            </Button>
         </HStack>
         {data?.inTeam && (
            <TabList
               role="tablist"
               size="sm"
               value={tab}
               onChange={(value) => setTab(value as 'mine' | 'queue')}
               hasDivider
            >
               <Tab
                  value="mine"
                  panelId="service-desk-list"
                  label={tx('My tickets ({count})', { count: data.mine.length })}
               />
               <Tab
                  value="queue"
                  panelId="service-desk-list"
                  label={tx('Queue ({count})', { count: data.queue.filter(isOpen).length })}
               />
            </TabList>
         )}
         <div className="grid shrink-0 grid-cols-2 gap-2 p-2">
            <TicketStateSelect value={ticketState} onChange={setTicketState} />
            {tab === 'queue' && (
               <Select value={projectFilter} onValueChange={setProjectFilter}>
                  <SelectTrigger aria-label={tx('Project')} className="w-full">
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value={ALL_PROJECTS}>{tx('All projects')}</SelectItem>
                     {queueProjects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                           {project.name}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
            )}
         </div>
         {notice && (
            <p role="alert" className="shrink-0 p-4 text-sm text-destructive">
               {notice}
            </p>
         )}
         <VStack
            id="service-desk-list"
            role={data?.inTeam ? 'tabpanel' : undefined}
            className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
         >
            {!data && loadError && <QueryState message={loadError} onRetry={() => void load()} />}
            {!data && !loadError && <LoadingState />}
            {data && rows.length === 0 && (
               <Text type="supporting" className="p-4 text-center">
                  {tx(
                     tab === 'queue'
                        ? 'No tickets are waiting for your team.'
                        : data.mine.length === 0
                          ? 'You have no tickets yet.'
                          : 'No tickets in this view.'
                  )}
               </Text>
            )}
            <TicketList
               rows={rows}
               selected={selected}
               inQueue={tab === 'queue'}
               onSelect={setSelected}
            />
         </VStack>
      </VStack>
   );

   // The assistant belongs to "My tickets"; the queue keeps its plain empty state.
   // VI: Trợ lý thuộc tab "Ticket của tôi"; hàng đợi giữ trạng thái trống như cũ.
   const assistantPanel = data && assistant && tab === 'mine' && (
      <ServiceDeskAssistant
         key={data.workspaceId}
         workspaceId={data.workspaceId}
         workspaceSlug={orgId}
         applications={assistant.applications}
         onCreateTicket={newTicket}
         onClose={isMobile ? () => setAsking(false) : undefined}
      />
   );

   const preview =
      data && ticket ? (
         <TicketDetail
            key={ticket.id}
            workspaceId={data.workspaceId}
            ticket={ticket}
            canHandle={Boolean(queued)}
            members={data.teams.find((team) => team.id === ticket.teamId)?.members ?? []}
            onChanged={load}
            onClose={() => setSelected(undefined)}
            onEdit={() => setDialog('edit')}
            onArchived={() => {
               setSelected(undefined);
               void load();
            }}
         />
      ) : (
         assistantPanel || (
            <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
               {tx('Select a ticket to read it.')}
            </div>
         )
      );

   return (
      <>
         {isMobile ? (
            ticket || (asking && assistantPanel) ? (
               preview
            ) : (
               list
            )
         ) : (
            <HStack className="h-full w-full overflow-hidden">
               <VStack className="h-full w-[360px] max-w-[46%] shrink-0 border-r bg-container">
                  {list}
               </VStack>
               <VStack className="h-full min-w-0 flex-1">{preview}</VStack>
            </HStack>
         )}
         {data && dialog && (
            <TicketDialog
               workspaceId={data.workspaceId}
               projects={data.projects}
               ticket={dialog === 'edit' ? ticket : undefined}
               initial={dialog === 'new' ? draft : undefined}
               onClose={() => setDialog(undefined)}
               onSaved={(id, uploadError) => {
                  setDialog(undefined);
                  setAsking(false);
                  setSelected(id);
                  setNotice(uploadError);
                  void load();
               }}
            />
         )}
      </>
   );
}
