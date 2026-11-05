'use client';

import { useEffect, useState } from 'react';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { Text } from '@astryxdesign/core/Text';
import { LoadingState } from '@/components/common/loading-state';
import { QueryState } from '@/components/common/query-state';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { DocTypeBadge } from '@/features/documents/document-badges';
import { EmptyPreview } from '@/features/documents/doc-preview';
import { DocumentView } from '@/features/documents/document-page';
import { useMessages } from '@/features/shared/use-messages';
import { useIsMobile } from '@/hooks/use-mobile';
import { parseInstant } from '@/lib/time';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { messages } from './messages.vi';
import { useApprovalsStore, type Approvals, type HandledApproval } from './approvals-store';

type ApprovalTab = keyof Approvals;

const EMPTY_MESSAGES = {
   waiting: 'Nothing is waiting for you.',
   submitted: 'You have no documents in review.',
   done: 'You have not handled any documents yet.',
} as const;

/**
 * Everything waiting on the signed-in user, beside the document it opens. Acting happens in the
 * document view, which applies the review rules, so the lists stay read-only and reload after
 * each change. On a narrow screen the document replaces the list until it is closed.
 * VI: Mọi thứ đang chờ người dùng, bên cạnh tài liệu được mở. Thao tác diễn ra trong khung xem tài
 * VI: liệu, nơi áp dụng quy tắc duyệt, nên danh sách chỉ đọc và tải lại sau mỗi thay đổi. Trên màn
 * VI: hình hẹp, tài liệu thay chỗ danh sách cho tới khi đóng.
 */
export function ApprovalsPage() {
   const tx = useMessages(messages);
   const locale = useUiPreferencesStore((state) => state.locale);
   const isMobile = useIsMobile();
   const { approvals, error, load } = useApprovalsStore();
   const [tab, setTab] = useState<ApprovalTab>('waiting');
   const [selected, setSelected] = useState<string>();
   useEffect(() => void load(), [load]);

   const when = (value: string) => parseInstant(value).toLocaleString(locale);
   const handledLabel = (item: HandledApproval) => {
      if (item.release) return tx('Approved v{release}', { release: item.release });
      if (item.decision === 'APPROVED') return tx('Agreed');
      if (item.decision === 'CHANGES_REQUESTED') return tx('Changes requested');
      return tx('Reviewed');
   };
   const rows = () => {
      if (!approvals) return [];
      if (tab === 'waiting')
         return approvals.waiting.map((item) => ({
            item,
            note: undefined,
            time: item.updatedAt,
            state: tx(item.role === 'REVIEWER' ? 'Reviewer' : 'Approver'),
         }));
      if (tab === 'submitted')
         return approvals.submitted.map((item) => ({
            item,
            note: item.changeRequests.map(({ name, note }) => `${name}: ${note}`).join(' · '),
            time: item.updatedAt,
            state: tx(item.status === 'DRAFT' ? 'Changes requested' : 'In review'),
         }));
      return approvals.done.map((item) => ({
         item,
         note: undefined,
         time: item.handledAt,
         state: handledLabel(item),
      }));
   };

   const list = (
      <VStack className="h-full min-h-0 w-full">
         <HStack gap={2} className="h-10 shrink-0 items-center border-b px-4">
            <SidebarTrigger className="inline-flex lg:hidden" />
            <Text type="label">{tx('Approvals')}</Text>
         </HStack>
         <TabList
            role="tablist"
            size="sm"
            value={tab}
            onChange={(value) => setTab(value as ApprovalTab)}
            hasDivider
         >
            <Tab
               value="waiting"
               panelId="approvals-list"
               label={tx('Waiting for me ({count})', { count: approvals?.waiting.length ?? 0 })}
            />
            <Tab
               value="submitted"
               panelId="approvals-list"
               label={tx('Submitted ({count})', { count: approvals?.submitted.length ?? 0 })}
            />
            <Tab value="done" panelId="approvals-list" label={tx('Handled')} />
         </TabList>
         <VStack
            id="approvals-list"
            role="tabpanel"
            className="min-h-0 flex-1 overflow-y-auto px-2 py-2"
         >
            {!approvals && error && <QueryState message={error} onRetry={() => void load()} />}
            {!approvals && !error && <LoadingState />}
            {approvals && rows().length === 0 && (
               <Text type="supporting" className="p-4 text-center">
                  {tx(EMPTY_MESSAGES[tab])}
               </Text>
            )}
            {approvals && rows().length > 0 && (
               <List hasDividers>
                  {rows().map(({ item, note, time, state }) => (
                     <ListItem
                        key={item.id}
                        label={item.title}
                        isSelected={item.id === selected}
                        onClick={() => setSelected(item.id)}
                        startContent={<DocTypeBadge type={item.docType} />}
                        description={
                           <VStack gap={1}>
                              <Text type="supporting">
                                 {[
                                    item.project?.identifier ?? item.team?.name,
                                    item.author.name,
                                    when(time),
                                 ]
                                    .filter(Boolean)
                                    .join(' · ')}
                              </Text>
                              {note && <Text type="supporting">{note}</Text>}
                           </VStack>
                        }
                        endContent={
                           <VStack gap={1} className="items-end whitespace-nowrap">
                              <Text type="label">{state}</Text>
                              {item.progress.total > 0 && (
                                 <Text type="supporting">
                                    {tx('{agreed}/{total} agreed', item.progress)}
                                 </Text>
                              )}
                           </VStack>
                        }
                     />
                  ))}
               </List>
            )}
         </VStack>
      </VStack>
   );

   const preview = selected ? (
      <DocumentView
         key={selected}
         documentId={selected}
         onClose={() => setSelected(undefined)}
         onChanged={() => void load()}
      />
   ) : (
      <EmptyPreview />
   );

   if (isMobile) return selected ? preview : list;
   return (
      <HStack className="h-full w-full overflow-hidden">
         <VStack className="h-full w-[360px] max-w-[46%] shrink-0 border-r bg-container">
            {list}
         </VStack>
         <VStack className="h-full min-w-0 flex-1">{preview}</VStack>
      </HStack>
   );
}
