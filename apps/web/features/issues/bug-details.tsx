'use client';
import { useEnumLabel } from '@/features/shared/enum-labels';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';

import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useIssuesStore } from '@/store/issues-store';
import type { Issue } from '@/mock-data/issues';
import { BugFieldsForm, type BugFields } from './bug-fields';
export function BugDetails({ issue }: { issue: Issue }) {
   const tx = useMessages(messages);
   const enumLabel = useEnumLabel();

   const [editing, setEditing] = useState(false);
   const [draft, setDraft] = useState<BugFields>(issue);
   const [error, setError] = useState<string>();
   const update = useIssuesStore((state) => state.updateIssueBug);
   return (
      <VStack gap={3} as="section">
         <Heading level={4} accessibilityLevel={2}>
            {issue.issueType === 'BUG' ? tx('Bug report') : tx('Task details')}
         </Heading>
         {editing ? (
            <>
               <BugFieldsForm value={draft} onChange={setDraft} />
               {error && <Text role="alert">{error}</Text>}
               <HStack gap={2}>
                  <Button
                     label={tx('Save bug details')}
                     clickAction={async () => {
                        try {
                           await update(issue.id, draft);
                           setEditing(false);
                           setError(undefined);
                        } catch (reason) {
                           setError(
                              reason instanceof Error
                                 ? reason.message
                                 : tx('Could not save bug details.')
                           );
                        }
                     }}
                  />
                  <Button label={tx('Cancel bug editing')} onClick={() => setEditing(false)} />
               </HStack>
            </>
         ) : (
            <>
               {issue.issueType === 'BUG' && (
                  <>
                     <Text>
                        {tx('Severity:')}{' '}
                        {issue.severity ? enumLabel(issue.severity) : tx('Unspecified')}
                     </Text>
                     {(
                        [
                           'environment',
                           'reproductionSteps',
                           'expectedResult',
                           'actualResult',
                        ] as const
                     ).map((field) => (
                        <VStack key={field} gap={1}>
                           <Text weight="medium">
                              {
                                 {
                                    environment: tx('Environment'),
                                    reproductionSteps: tx('Steps to reproduce'),
                                    expectedResult: tx('Expected result'),
                                    actualResult: tx('Actual result'),
                                 }[field]
                              }
                           </Text>
                           <Text className="whitespace-pre-wrap">
                              {issue[field] || tx('Not provided')}
                           </Text>
                        </VStack>
                     ))}
                  </>
               )}
               <Button
                  label={tx('Edit type and bug details')}
                  variant="ghost"
                  size="sm"
                  className="self-start text-muted-foreground"
                  onClick={() => {
                     setDraft({
                        issueType: issue.issueType ?? 'TASK',
                        severity: issue.severity,
                        environment: issue.environment,
                        reproductionSteps: issue.reproductionSteps,
                        expectedResult: issue.expectedResult,
                        actualResult: issue.actualResult,
                     });
                     setEditing(true);
                  }}
               />
            </>
         )}
      </VStack>
   );
}
