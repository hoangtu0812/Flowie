'use client';
import { useEnumLabel } from '@/features/shared/enum-labels';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';

import { useState } from 'react';
import { Check, Pencil, X } from 'lucide-react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { useIssuesStore } from '@/store/issues-store';
import type { Issue } from '@/mock-data/issues';
import { BugFieldsForm, type BugFields } from './bug-fields';
/**
 * Bug report block of the issue body, shown only for bugs: severity, environment, reproduction
 * steps and expected/actual result, with an editor for those fields. The Task/Bug type itself is
 * a property in the properties panel, so a plain task shows no block here at all.
 * VI: Khối Bug report trong thân issue, chỉ hiện với bug: mức độ, môi trường, các bước tái hiện
 * VI: và kết quả mong đợi/thực tế, kèm form sửa các trường đó. Loại Task/Bug là một thuộc tính ở
 * VI: panel Properties, nên task thường không có khối nào ở đây.
 */
export function BugDetails({ issue }: { issue: Issue }) {
   const tx = useMessages(messages);
   const enumLabel = useEnumLabel();

   const [editing, setEditing] = useState(false);
   const [draft, setDraft] = useState<BugFields>(issue);
   const [error, setError] = useState<string>();
   const update = useIssuesStore((state) => state.updateIssueBug);
   if (issue.issueType !== 'BUG') return null;
   return (
      <VStack gap={3} as="section">
         <HStack gap={2} vAlign="center" hAlign="between">
            <Heading level={4} accessibilityLevel={2}>
               {tx('Bug report')}
            </Heading>
            {!editing && (
               <Button
                  label={tx('Edit bug details')}
                  tooltip={tx('Edit bug details')}
                  icon={<Pencil className="size-4" />}
                  isIconOnly
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                     setDraft({
                        issueType: 'BUG',
                        severity: issue.severity,
                        environment: issue.environment,
                        reproductionSteps: issue.reproductionSteps,
                        expectedResult: issue.expectedResult,
                        actualResult: issue.actualResult,
                     });
                     setEditing(true);
                  }}
               />
            )}
         </HStack>
         {editing ? (
            <>
               <BugFieldsForm value={draft} onChange={setDraft} showTypeSelector={false} />
               {error && <Text role="alert">{error}</Text>}
               <HStack gap={2}>
                  <Button
                     label={tx('Save bug details')}
                     tooltip={tx('Save bug details')}
                     isIconOnly
                     icon={<Check className="size-4" />}
                     variant="primary"
                     size="sm"
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
                  <Button
                     label={tx('Cancel bug editing')}
                     tooltip={tx('Cancel bug editing')}
                     icon={<X className="size-4" />}
                     isIconOnly
                     variant="ghost"
                     size="sm"
                     onClick={() => setEditing(false)}
                  />
               </HStack>
            </>
         ) : (
            <>
               <Text>
                  {tx('Severity:')} {issue.severity ? enumLabel(issue.severity) : tx('Unspecified')}
               </Text>
               {(
                  ['environment', 'reproductionSteps', 'expectedResult', 'actualResult'] as const
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
      </VStack>
   );
}
