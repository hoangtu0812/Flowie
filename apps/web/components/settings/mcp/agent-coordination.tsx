'use client';

import { useCallback, useEffect, useState } from 'react';
import { Ban, FileText, PowerOff, RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { List, ListItem } from '@astryxdesign/core/List';
import {
   loadAgentRuns,
   loadRunEvidence,
   loadAgentRunSummary,
   loadAgentAutomations,
   cancelAgentRun,
   disableAgentAutomation,
   type AgentRun,
   type AgentRunSummary,
   type AgentAutomation,
} from '@/lib/agent-runs';

export function AgentCoordination({
   workspaceId,
   canManage,
}: {
   workspaceId: string;
   canManage: boolean;
}) {
   const [runs, setRuns] = useState<AgentRun[]>([]);
   const [summary, setSummary] = useState<AgentRunSummary[]>([]);
   const [automations, setAutomations] = useState<AgentAutomation[]>([]);
   const [error, setError] = useState<string>();
   const [busy, setBusy] = useState(false);
   const [evidence, setEvidence] = useState<Awaited<ReturnType<typeof loadRunEvidence>>>();

   const refresh = useCallback(async () => {
      const [nextRuns, nextSummary, nextAutomations] = await Promise.all([
         loadAgentRuns(workspaceId),
         loadAgentRunSummary(workspaceId),
         canManage ? loadAgentAutomations(workspaceId) : Promise.resolve([]),
      ]);
      setRuns(nextRuns.items);
      setSummary(nextSummary);
      setAutomations(nextAutomations);
   }, [workspaceId, canManage]);

   useEffect(() => {
      void refresh().catch((cause: unknown) =>
         setError(cause instanceof Error ? cause.message : 'Could not load agent runs.')
      );
   }, [refresh]);

   async function perform(operation: () => Promise<unknown>, success: string) {
      setBusy(true);
      setError(undefined);
      try {
         await operation();
         await refresh();
         toast.success(success);
      } catch (cause) {
         toast.error(cause instanceof Error ? cause.message : 'The operation failed.');
      } finally {
         setBusy(false);
      }
   }

   return (
      <VStack gap={3}>
         <HStack gap={3} vAlign="center">
            <Heading level={3}>Coding agent runs</Heading>
            <Button
               label="Refresh runs"
               tooltip="Refresh runs"
               icon={<RefreshCw className="size-4" />}
               isIconOnly
               variant="ghost"
               size="sm"
               isLoading={busy}
               onClick={() => void perform(async () => undefined, 'Agent runs refreshed.')}
            />
         </HStack>
         <Text color="secondary">
            Your external coding agent claims work, runs tests and reports evidence. Code results
            await review.
         </Text>
         {error && <Text role="alert">{error}</Text>}
         <List header={<Heading level={4}>Summary</Heading>}>
            {summary.map((item) => (
               <ListItem
                  key={item.state}
                  label={item.state.replaceAll('_', ' ')}
                  description={`${item.count} runs${item.averageSeconds === null ? '' : ` · average ${Math.round(item.averageSeconds)} seconds`}`}
               />
            ))}
         </List>
         <List hasDividers header={<Heading level={4}>Latest runs</Heading>}>
            {runs.map((run) => (
               <ListItem
                  key={run.id}
                  label={`${run.issueIdentifier} · ${run.issueTitle}`}
                  description={run.state.replaceAll('_', ' ')}
                  endContent={
                     <HStack gap={2}>
                        <Button
                           label="View evidence"
                           tooltip="View evidence"
                           icon={<FileText className="size-4" />}
                           isIconOnly
                           variant="ghost"
                           size="sm"
                           clickAction={async () => {
                              try {
                                 setEvidence(await loadRunEvidence(workspaceId, run.id));
                              } catch (reason) {
                                 toast.error(
                                    reason instanceof Error
                                       ? reason.message
                                       : 'Could not load evidence.'
                                 );
                              }
                           }}
                        />
                        {(canManage || run.ownedByCurrentUser) &&
                        ['PENDING', 'RUNNING'].includes(run.state) ? (
                           <Button
                              label="Cancel run"
                              tooltip="Cancel run"
                              icon={<Ban className="size-4" />}
                              isIconOnly
                              variant="ghost"
                              size="sm"
                              isDisabled={busy}
                              onClick={() =>
                                 void perform(
                                    () => cancelAgentRun(workspaceId, run.id),
                                    `Run for ${run.issueIdentifier} canceled.`
                                 )
                              }
                           />
                        ) : undefined}
                     </HStack>
                  }
               />
            ))}
         </List>
         {evidence && (
            <VStack gap={2}>
               <HStack gap={2} vAlign="center" hAlign="between">
                  <Heading level={4}>Run evidence · {evidence.state}</Heading>
                  <Button
                     label="Close evidence"
                     tooltip="Close evidence"
                     icon={<X className="size-4" />}
                     isIconOnly
                     variant="ghost"
                     size="sm"
                     onClick={() => setEvidence(undefined)}
                  />
               </HStack>
               <pre className="overflow-auto rounded bg-muted p-3">
                  <code>
                     {evidence.result
                        ? JSON.stringify(evidence.result, null, 2)
                        : 'The agent has not reported a result yet.'}
                  </code>
               </pre>
            </VStack>
         )}
         {!runs.length && <Text color="secondary">No coding agent runs yet.</Text>}
         {canManage && (
            <List hasDividers header={<Heading level={4}>Event automations</Heading>}>
               {automations.map((automation) => (
                  <ListItem
                     key={automation.id}
                     label={automation.name}
                     description={`${automation.enabled ? 'Enabled' : 'Disabled'} · up to ${automation.dailyLimit} runs per day`}
                     endContent={
                        <Button
                           label="Disable automation"
                           tooltip="Disable automation"
                           icon={<PowerOff className="size-4" />}
                           isIconOnly
                           variant="ghost"
                           size="sm"
                           isDisabled={!automation.enabled || busy}
                           onClick={() =>
                              void perform(
                                 () => disableAgentAutomation(workspaceId, automation.id),
                                 `Automation "${automation.name}" disabled.`
                              )
                           }
                        />
                     }
                  />
               ))}
            </List>
         )}
      </VStack>
   );
}
