'use client';
import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useIssuesStore } from '@/store/issues-store';
import type { Issue } from '@/mock-data/issues';
import { BugFieldsForm, type BugFields } from './bug-fields';
export function BugDetails({ issue }: { issue: Issue }) {
   const [editing, setEditing] = useState(false);
   const [draft, setDraft] = useState<BugFields>(issue);
   const [error, setError] = useState<string>();
   const update = useIssuesStore((state) => state.updateIssueBug);
   useEffect(() => {
      setEditing(false);
      setDraft(issue);
      setError(undefined);
   }, [issue.id]);
   return (
      <VStack gap={3} as="section">
         <Heading level={2}>{issue.issueType === 'BUG' ? 'Bug report' : 'Task details'}</Heading>
         {editing ? (
            <>
               <BugFieldsForm value={draft} onChange={setDraft} />
               {error && <Text role="alert">{error}</Text>}
               <HStack gap={2}>
                  <Button
                     label="Save bug details"
                     clickAction={async () => {
                        try {
                           await update(issue.id, draft);
                           setEditing(false);
                           setError(undefined);
                        } catch (reason) {
                           setError(
                              reason instanceof Error
                                 ? reason.message
                                 : 'Could not save bug details.'
                           );
                        }
                     }}
                  />
                  <Button label="Cancel bug editing" onClick={() => setEditing(false)} />
               </HStack>
            </>
         ) : (
            <>
               {issue.issueType === 'BUG' && (
                  <>
                     <Text>Severity: {issue.severity ?? 'Unspecified'}</Text>
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
                                    environment: 'Environment',
                                    reproductionSteps: 'Steps to reproduce',
                                    expectedResult: 'Expected result',
                                    actualResult: 'Actual result',
                                 }[field]
                              }
                           </Text>
                           <Text className="whitespace-pre-wrap">
                              {issue[field] || 'Not provided'}
                           </Text>
                        </VStack>
                     ))}
                  </>
               )}
               <Button
                  label="Edit type and bug details"
                  variant="ghost"
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
