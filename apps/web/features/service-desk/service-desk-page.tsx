'use client';

import { Plus } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
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
import { parseInstant } from '@/lib/time';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { messages } from './messages.vi';
import {
   listTicketProjects,
   listTickets,
   type Ticket,
   type TicketProject,
} from './service-desk-api';
import { TicketDetail, statusLabel } from './ticket-detail';
import { TicketDialog } from './ticket-dialog';

type DeskData = {
   workspaceId: string;
   teams: WorkspaceTeam[];
   inTeam: boolean;
   mine: Ticket[];
   queue: Ticket[];
   projects: TicketProject[];
};
const ALL_PROJECTS = 'all';
const STATE_LABELS = { open: 'Open', closed: 'Closed', all: 'All' } as const;
type QueueState = keyof typeof STATE_LABELS;
const isOpen = (ticket: Ticket) => !['done', 'canceled', 'declined'].includes(ticket.ticketStatus);

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
   const locale = useUiPreferencesStore((state) => state.locale);
   const isMobile = useIsMobile();
   const { ticketId } = useParams<{ ticketId?: string[] }>();
   const [data, setData] = useState<DeskData>();
   const [loadError, setLoadError] = useState<string>();
   const [notice, setNotice] = useState<string>();
   const [tab, setTab] = useState<'mine' | 'queue'>('mine');
   const [selected, setSelected] = useState(ticketId?.[0]);
   const [projectFilter, setProjectFilter] = useState(ALL_PROJECTS);
   const [queueState, setQueueState] = useState<QueueState>('open');
   const [dialog, setDialog] = useState<'new' | 'edit'>();

   const load = useCallback(async () => {
      try {
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
   }, []);
   useEffect(() => void load(), [load]);

   const queueProjects = useMemo(() => {
      const named = (data?.queue ?? []).flatMap((ticket) =>
         ticket.project ? [ticket.project] : []
      );
      return [...new Map(named.map((project) => [project.id, project])).values()];
   }, [data]);
   const rows =
      tab === 'mine'
         ? (data?.mine ?? [])
         : (data?.queue ?? []).filter(
              (ticket) =>
                 (projectFilter === ALL_PROJECTS || ticket.projectId === projectFilter) &&
                 (queueState === 'all' || isOpen(ticket) === (queueState === 'open'))
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
            <Button type="button" size="sm" disabled={!data} onClick={() => setDialog('new')}>
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
         {tab === 'queue' && (
            <div className="grid shrink-0 grid-cols-2 gap-2 p-2">
               <Select
                  value={queueState}
                  onValueChange={(value) => setQueueState(value as QueueState)}
               >
                  <SelectTrigger aria-label={tx('Status')} className="w-full">
                     <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                     {(Object.keys(STATE_LABELS) as QueueState[]).map((value) => (
                        <SelectItem key={value} value={value}>
                           {tx(STATE_LABELS[value])}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
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
            </div>
         )}
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
                     tab === 'mine'
                        ? 'You have no tickets yet.'
                        : 'No tickets are waiting for your team.'
                  )}
               </Text>
            )}
            {rows.length > 0 && (
               <List hasDividers>
                  {rows.map((row) => (
                     <ListItem
                        key={row.id}
                        label={row.title}
                        isSelected={row.id === selected}
                        onClick={() => setSelected(row.id)}
                        description={
                           <Text type="supporting">
                              {[
                                 row.project?.name ?? row.team.name,
                                 row.createdBy.name,
                                 row.assignee &&
                                    tx('Assigned to {name}', { name: row.assignee.name }),
                                 parseInstant(row.updatedAt).toLocaleString(locale),
                              ]
                                 .filter(Boolean)
                                 .join(' · ')}
                           </Text>
                        }
                        endContent={
                           <Text type="label" className="whitespace-nowrap">
                              {tx(statusLabel(row.ticketStatus, tab === 'queue'))}
                           </Text>
                        }
                     />
                  ))}
               </List>
            )}
         </VStack>
      </VStack>
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
         <div className="grid h-full place-items-center p-6 text-center text-sm text-muted-foreground">
            {tx('Select a ticket to read it.')}
         </div>
      );

   return (
      <>
         {isMobile ? (
            ticket ? (
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
               onClose={() => setDialog(undefined)}
               onSaved={(id, uploadError) => {
                  setDialog(undefined);
                  setSelected(id);
                  setNotice(uploadError);
                  void load();
               }}
            />
         )}
      </>
   );
}
