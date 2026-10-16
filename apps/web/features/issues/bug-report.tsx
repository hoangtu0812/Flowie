'use client';
import { useEnumLabel } from '@/features/shared/enum-labels';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';

import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { useIssuesStore } from '@/store/issues-store';
type Report = { total: number; groups: { severity: string; category: string; count: number }[] };
export function BugReport({
   teamReference,
   open,
   onOpenChange,
}: {
   teamReference?: string;
   open: boolean;
   onOpenChange: (open: boolean) => void;
}) {
   const tx = useMessages(messages);
   const enumLabel = useEnumLabel();

   const [report, setReport] = useState<Report>();
   const [error, setError] = useState<string>();
   const [refresh, setRefresh] = useState(0);
   const teams = useIssuesStore((state) => state.teams);
   const team = teams.find(
      (item) => item.id === teamReference || item.identifier === teamReference
   );
   useEffect(() => {
      if (!open || (teamReference && !team)) return;
      let active = true;
      setReport(undefined);
      setError(undefined);
      void (async () => {
         try {
            const workspace = await loadCurrentWorkspace();
            const query = new URLSearchParams({ workspaceId: workspace.id });
            if (team) query.set('teamId', team.id);
            const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
            const result = await responseData<Report>(
               await authenticatedFetch(`${api}/issues/bug-report?${query}`)
            );
            if (active) setReport(result);
         } catch (reason) {
            if (active)
               setError(
                  reason instanceof Error ? reason.message : tx('Could not load bug report.')
               );
         }
      })();
      return () => {
         active = false;
      };
   }, [open, team, teamReference, refresh, tx]);
   return (
      <Dialog isOpen={open} onOpenChange={onOpenChange} purpose="info" padding={5}>
         <VStack gap={4}>
            <DialogHeader
               data-autofocus
               tabIndex={-1}
               className="outline-none"
               title={tx('Bug report')}
               onOpenChange={onOpenChange}
            />
            <Text type="supporting">{tx('Bugs by severity and workflow status')}</Text>
            {error ? (
               <Text role="alert">{error}</Text>
            ) : !report ? (
               <Text role="status">{tx('Loading report…')}</Text>
            ) : (
               <>
                  <Text>
                     {report.total} {tx('bugs in accessible')} {team ? tx('team') : tx('workspace')}{' '}
                     {tx('issues.')}
                  </Text>
                  {report.groups.map((group) => (
                     <HStack key={`${group.severity}/${group.category}`} justify="between" gap={3}>
                        <Text>
                           {enumLabel(group.severity)} · {enumLabel(group.category)}
                        </Text>
                        <Text>{group.count}</Text>
                     </HStack>
                  ))}
               </>
            )}
            <Button
               label={tx('Refresh bug report')}
               onClick={() => setRefresh((value) => value + 1)}
            />
         </VStack>
      </Dialog>
   );
}
