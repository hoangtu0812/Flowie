'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/data-exchange/messages.vi';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { RecoveryScreen } from '@/features/shared/recovery-screen';
import { authenticatedFetch, loadCurrentWorkspaceMembership } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { ImportPanel } from './import-panel';
import { DocumentExportPanel } from './export-panel';

export default function DataExchangePage() {
   const tx = useMessages(messages);

   const { orgId } = useParams<{ orgId: string }>();
   const [scope, setScope] = useState<{
      org: string;
      workspace?: string;
      teams?: { id: string; name: string }[];
      error?: string;
   }>();
   const [retry, setRetry] = useState(0);
   useEffect(() => {
      let active = true;
      void (async () => {
         const member = await loadCurrentWorkspaceMembership(orgId);
         const teams = await responseData<{ id: string; name: string; joined: boolean }[]>(
            await authenticatedFetch(
               `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/teams?workspaceId=${member.workspace.id}`
            )
         );
         if (active)
            setScope({
               org: orgId,
               workspace: member.workspace.id,
               teams: teams.filter((row) => row.joined),
            });
      })().catch((reason) => {
         if (active)
            setScope({
               org: orgId,
               error:
                  reason instanceof Error ? reason.message : tx('Could not load data exchange.'),
            });
      });
      return () => {
         active = false;
      };
   }, [orgId, retry, tx]);
   if (scope?.org === orgId && scope.error)
      return (
         <RecoveryScreen
            title={tx('Data exchange unavailable')}
            message={scope.error}
            retry={() => setRetry((value) => value + 1)}
         />
      );
   if (scope?.org !== orgId || !scope.workspace)
      return (
         <DesignSurface>
            <Text role="status">{tx('Loading data exchange…')}</Text>
         </DesignSurface>
      );
   return (
      <DesignSurface>
         <VStack
            padding={6}
            gap={6}
            width="100%"
            className="h-full overflow-auto"
            key={scope.workspace}
         >
            <Heading level={1}>{tx('Import and export')}</Heading>
            <Text>
               {tx(
                  'Export tasks from the list using Export matching issues CSV. Exports follow the same applied filters and current access, up to 10,000 tasks / 10 MB. Formula-like text has a leading tab for spreadsheet viewing; treat imported CSV cells as text.'
               )}
            </Text>
            <ImportPanel workspace={scope.workspace} teams={scope.teams ?? []} />
            <DocumentExportPanel workspace={scope.workspace} />
         </VStack>
      </DesignSurface>
   );
}
