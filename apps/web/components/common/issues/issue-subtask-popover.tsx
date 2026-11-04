'use client';

import { useEffect, useState } from 'react';
import { HoverCard } from '@astryxdesign/core/HoverCard';
import { VStack } from '@astryxdesign/core/Layout';
import { List, ListItem } from '@astryxdesign/core/List';
import { Text } from '@astryxdesign/core/Text';
import { Icon } from '@astryxdesign/core/Icon';
import { Button } from '@astryxdesign/core/Button';
import { ListTree, Circle, CircleDot, CircleCheck, CircleDashed, CircleX } from 'lucide-react';
import { DesignSurface } from '@/components/common/design-surface';
import { authenticatedFetch } from '@/lib/workspaces';
import { useIssuesStore } from '@/store/issues-store';
import { useMessages } from '@/features/shared/use-messages';
import { issueHref } from '@/lib/issue-route';
import { withBasePath } from '@/lib/base-path';
import type { Issue } from '@/mock-data/issues';

const messages = {
   'Sub-issues of {identifier}': 'Task con của {identifier}',
   'Loading sub-issues…': 'Đang tải task con…',
   'Could not load sub-issues.': 'Không tải được task con.',
   'No active sub-issues.': 'Không có task con đang hoạt động.',
   'Retry': 'Thử lại',
} as const;
type Child = {
   id: string;
   identifier: string;
   title: string;
   status: { name: string; category: string };
};
function statusIcon(category: string) {
   switch (category.toUpperCase()) {
      case 'STARTED':
         return CircleDot;
      case 'COMPLETED':
         return CircleCheck;
      case 'CANCELED':
         return CircleX;
      case 'BACKLOG':
      case 'TRIAGE':
         return CircleDashed;
      default:
         return Circle;
   }
}

export function IssueSubtaskPopover({
   issue,
   orgId,
   projectPath,
}: {
   issue: Issue;
   orgId: string;
   projectPath: boolean;
}) {
   const tx = useMessages(messages);
   const workspaceId = useIssuesStore((state) => state.workspaceId);
   const [open, setOpen] = useState(false);
   const [attempt, setAttempt] = useState(0);
   const [children, setChildren] = useState<Child[]>();
   const [error, setError] = useState(false);
   useEffect(() => {
      if (!open || !workspaceId) return;
      const controller = new AbortController();
      setChildren(undefined);
      setError(false);
      // Re-fetch direct children on every opening; closing aborts the request and prevents stale results.
      // VI: Mỗi lần mở tải lại con trực tiếp; đóng sẽ hủy request và không nhận kết quả cũ.
      void authenticatedFetch(
         `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/issues/${issue.id}/sub-issues?${new URLSearchParams({ workspaceId })}`,
         { signal: controller.signal }
      )
         .then(async (response) => {
            if (!response.ok) throw new Error('sub-issues');
            const payload = await response.json();
            if (!controller.signal.aborted) setChildren(payload.data);
         })
         .catch(() => {
            if (!controller.signal.aborted) setError(true);
         });
      return () => controller.abort();
   }, [open, workspaceId, issue.id, attempt]);
   if (!issue.subIssueCount) return null;
   const label = tx('Sub-issues of {identifier}', { identifier: issue.identifier });
   return (
      <DesignSurface>
         <HoverCard
            label={label}
            placement="above"
            delay={150}
            hideDelay={120}
            onOpenChange={setOpen}
            focusTrigger="always"
            touchTrigger="tap"
            content={
               <VStack
                  gap={1}
                  className="w-96 max-w-full max-h-64 overflow-y-auto"
                  data-testid="subtask-popover-list"
               >
                  {error ? (
                     <>
                        <Text role="alert">{tx('Could not load sub-issues.')}</Text>
                        <Button
                           label={tx('Retry')}
                           variant="ghost"
                           size="sm"
                           onClick={() => setAttempt((value) => value + 1)}
                        />
                     </>
                  ) : !children ? (
                     <Text role="status">{tx('Loading sub-issues…')}</Text>
                  ) : !children.length ? (
                     <Text>{tx('No active sub-issues.')}</Text>
                  ) : (
                     <List density="compact" header={label}>
                        {children.map((child) => (
                           <ListItem
                              key={child.id}
                              label={`${child.identifier} · ${child.title}`}
                              // ListItem renders a native anchor; unlike Next Link, it needs the browser base path.
                              // VI: ListItem tạo anchor thuần; khác Next Link, nó cần thêm base path của trình duyệt.
                              href={withBasePath(issueHref(orgId, child.identifier, projectPath))}
                              startContent={
                                 <Icon
                                    icon={statusIcon(child.status.category)}
                                    size="sm"
                                    label={child.status.name}
                                 />
                              }
                              description={<Text type="supporting">{child.status.name}</Text>}
                           />
                        ))}
                     </List>
                  )}
               </VStack>
            }
         >
            <button
               type="button"
               aria-label={label}
               aria-expanded={open}
               data-testid="sub-issue-progress"
               className="inline-flex shrink-0 items-center gap-1 rounded border border-border px-1.5 text-xs text-muted-foreground"
            >
               <Icon icon={ListTree} size="xsm" />
               <Text type="inherit">
                  {issue.completedSubIssueCount ?? 0}/{issue.subIssueCount}
               </Text>
            </button>
         </HoverCard>
      </DesignSurface>
   );
}
