'use client';

import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { HStack, VStack, Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Tooltip } from '@astryxdesign/core/Tooltip';
import { DesignSurface } from '@/components/common/design-surface';
import { useMessages } from '@/features/shared/use-messages';
import { authenticatedFetch } from '@/lib/workspaces';
import { useIssuesStore } from '@/store/issues-store';
import { useEffect, useRef, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
const messages = {
   'Search issues': 'Tìm công việc',
   'Search by ID or title': 'Tìm theo mã hoặc tiêu đề',
   'Searching…': 'Đang tìm…',
   'No issues found.': 'Không tìm thấy công việc.',
   'Could not search issues.': 'Không tìm được công việc.',
   'Could not change the parent issue.': 'Không thay đổi được task cha.',
   'Retry': 'Thử lại',
   'Back': 'Quay lại',
   'Move': 'Di chuyển',
   'Moving…': 'Đang di chuyển…',
   'Move sub-issue?': 'Di chuyển task con?',
   'in {parent}': 'thuộc {parent}',
   'Set parent': 'Đặt task cha',
   'Change parent': 'Đổi task cha',
   'Add existing sub-issue': 'Thêm task con có sẵn',
} as const;

export type IssueCandidate = {
   id: string;
   identifier: string;
   title: string;
   status: { name: string; color: string };
   parent: { id: string; identifier: string; title: string } | null;
};

function CandidateRow({
   issue,
   description,
   saving,
   onPick,
}: {
   issue: IssueCandidate;
   description?: string;
   saving: boolean;
   onPick: () => void;
}) {
   const anchor = useRef<HTMLLIElement>(null);
   return (
      <>
         <ListItem
            ref={anchor}
            label={
               <Text maxLines={1} hasTruncateTooltip={false}>
                  {issue.identifier} · {issue.title}
               </Text>
            }
            startContent={
               <StatusDot variant="neutral" label={issue.status.name} tooltip={issue.status.name} />
            }
            description={description}
            isDisabled={saving}
            onClick={onPick}
         />
         <Tooltip anchorRef={anchor} content={`${issue.identifier} · ${issue.title}`} />
      </>
   );
}

/**
 * Shares the same-team picker between parent changes and attaching existing children. Search
 * requests are canceled on scope/query changes, and long names stay inside the scrollable list.
 * Existing-parent moves require confirmation; server errors keep the selection dialog open.
 * VI: Dùng chung bộ chọn cùng team cho đổi cha và gắn task con có sẵn. Hủy request khi đổi phạm vi
 * VI: hoặc truy vấn, tên dài nằm gọn trong danh sách cuộn. Chuyển task đã có cha cần xác nhận;
 * VI: lỗi server giữ hộp chọn mở để người dùng xử lý.
 */
export function IssueSearchDialog({
   open,
   onOpenChange,
   title,
   description,
   teamId,
   excludeIds,
   moveTarget,
   onPick,
   workspaceId: requestedWorkspaceId,
   inline = false,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   title: string;
   description: string;
   teamId?: string;
   excludeIds: string[];
   moveTarget?: { id: string; identifier: string };
   onPick: (issue: IssueCandidate) => Promise<void>;
   workspaceId?: string;
   inline?: boolean;
}) {
   const storedWorkspaceId = useIssuesStore((state) => state.workspaceId);
   const workspaceId = requestedWorkspaceId ?? storedWorkspaceId;
   const tx = useMessages(messages);
   const [query, setQuery] = useState('');
   const [results, setResults] = useState<IssueCandidate[]>([]);
   const [pending, setPending] = useState<IssueCandidate>();
   const [loading, setLoading] = useState(false);
   const [saving, setSaving] = useState(false);
   const [error, setError] = useState<string>();
   const [retry, setRetry] = useState(0);

   useEffect(() => {
      if (!open || !workspaceId) return;
      const controller = new AbortController();
      setLoading(true);
      setError(undefined);
      setResults([]);
      const timer = window.setTimeout(() => {
         const params = new URLSearchParams({ workspaceId, query: query.trim(), limit: '20' });
         if (teamId) params.set('teamId', teamId);
         else params.set('noTeam', 'true');
         void authenticatedFetch(`${api}/issues?${params}`, { signal: controller.signal })
            .then(async (response) => {
               if (!response.ok) throw new Error('Could not search issues.');
               const data = ((await response.json()) as { data: IssueCandidate[] }).data;
               if (!controller.signal.aborted) setResults(data);
            })
            .catch((caught: unknown) => {
               if (!controller.signal.aborted)
                  setError(caught instanceof Error ? caught.message : 'Could not search issues.');
            })
            .finally(() => {
               if (!controller.signal.aborted) setLoading(false);
            });
      }, 250);
      return () => {
         window.clearTimeout(timer);
         controller.abort();
      };
   }, [open, query, teamId, workspaceId, retry]);

   const reset = () => {
      setQuery('');
      setPending(undefined);
      setError(undefined);
      setResults([]);
   };
   const close = (next: boolean) => {
      if (saving) return;
      onOpenChange(next);
      if (!next) reset();
   };
   const save = async (issue: IssueCandidate) => {
      if (saving) return;
      setSaving(true);
      setError(undefined);
      try {
         await onPick(issue);
         onOpenChange(false);
         reset();
      } catch (caught) {
         setError(
            caught instanceof Error ? caught.message : tx('Could not change the parent issue.')
         );
      } finally {
         setSaving(false);
      }
   };
   const pick = (issue: IssueCandidate) => {
      if (moveTarget && issue.parent && issue.parent.id !== moveTarget.id) setPending(issue);
      else void save(issue);
   };
   const visible = results.filter((issue) => !excludeIds.includes(issue.id));
   const titles: Record<string, string> = {
      'Set parent': tx('Set parent'),
      'Change parent': tx('Change parent'),
      'Add existing sub-issue': tx('Add existing sub-issue'),
   };
   if (!open) return null;
   const content = (
      <Layout
         height="auto"
         padding={4}
         className="min-w-0"
         header={
            <DialogHeader
               title={pending ? tx('Move sub-issue?') : (titles[title] ?? title)}
               subtitle={
                  pending && moveTarget
                     ? `${pending.identifier} is a sub-issue of ${pending.parent?.identifier}. Move it under ${moveTarget.identifier}?`
                     : description
               }
               onOpenChange={close}
            />
         }
         footer={
            pending ? (
               <LayoutFooter>
                  <HStack gap={2} justify="end">
                     <Button
                        label={tx('Back')}
                        onClick={() => setPending(undefined)}
                        isDisabled={saving}
                     />
                     <Button
                        label={tx(saving ? 'Moving…' : 'Move')}
                        onClick={() => void save(pending)}
                        isDisabled={saving}
                     />
                  </HStack>
               </LayoutFooter>
            ) : undefined
         }
      >
         <LayoutContent padding={0}>
            <VStack gap={2} width="100%" className="min-w-0">
               {!pending && (
                  <>
                     <TextInput
                        label={tx('Search issues')}
                        isLabelHidden
                        value={query}
                        onChange={setQuery}
                        placeholder={tx('Search by ID or title')}
                        hasAutoFocus
                        hasClear
                        isDisabled={saving}
                        width="100%"
                     />
                     <VStack isScrollable className="max-h-72 min-w-0" aria-busy={loading}>
                        {loading ? (
                           <Text role="status">{tx('Searching…')}</Text>
                        ) : (
                           <List density="compact">
                              {visible.map((issue) => (
                                 <CandidateRow
                                    key={issue.id}
                                    issue={issue}
                                    description={
                                       issue.parent
                                          ? tx('in {parent}', {
                                               parent: issue.parent.identifier,
                                            })
                                          : undefined
                                    }
                                    saving={saving}
                                    onPick={() => pick(issue)}
                                 />
                              ))}
                           </List>
                        )}
                        {!loading && !error && visible.length === 0 && (
                           <Text type="supporting">{tx('No issues found.')}</Text>
                        )}
                     </VStack>
                  </>
               )}
               {error && (
                  <VStack gap={2}>
                     <Text role="alert">
                        {error === 'Could not search issues.'
                           ? tx('Could not search issues.')
                           : error}
                     </Text>
                     {!pending && (
                        <Button
                           label={tx('Retry')}
                           onClick={() => setRetry((value) => value + 1)}
                           isDisabled={saving}
                        />
                     )}
                  </VStack>
               )}
            </VStack>
         </LayoutContent>
      </Layout>
   );
   return (
      <DesignSurface>
         {inline ? (
            content
         ) : (
            <Dialog isOpen onOpenChange={close} width={520} purpose="form">
               {content}
            </Dialog>
         )}
      </DesignSurface>
   );
}
