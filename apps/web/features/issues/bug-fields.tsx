'use client';
import { useEnumLabel } from '@/features/shared/enum-labels';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/issues/messages.vi';

import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
import {
   Select,
   SelectTrigger,
   SelectValue,
   SelectContent,
   SelectItem,
} from '@/components/ui/select';
import { Minus, SignalLow, SignalMedium, SignalHigh, OctagonAlert } from 'lucide-react';
import { DesignSurface } from '@/components/common/design-surface';
export type BugFields = {
   issueType?: 'TASK' | 'BUG';
   severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
   environment?: string | null;
   reproductionSteps?: string | null;
   expectedResult?: string | null;
   actualResult?: string | null;
};
export const emptyBug: BugFields = {
   issueType: 'TASK',
   severity: null,
   environment: '',
   reproductionSteps: '',
   expectedResult: '',
   actualResult: '',
};
export function IssueTypeSelector({
   value,
   onChange,
   disabled,
}: {
   value: BugFields;
   onChange: (value: BugFields) => void;
   disabled?: boolean;
}) {
   const tx = useMessages(messages);
   return (
      <HStack gap={2} wrap="wrap" align="center">
         <Text type="supporting">{tx('Issue type')}</Text>
         <HStack
            gap={1}
            padding={1}
            className="rounded-lg bg-muted/50"
            role="group"
            aria-label={tx('Issue type')}
         >
            {(['TASK', 'BUG'] as const).map((type) => (
               <Button
                  key={type}
                  label={type === 'BUG' ? tx('Bug') : tx('Task')}
                  size="sm"
                  aria-pressed={(value.issueType ?? 'TASK') === type}
                  variant={(value.issueType ?? 'TASK') === type ? 'secondary' : 'ghost'}
                  className={(value.issueType ?? 'TASK') === type ? 'shadow-sm' : undefined}
                  isDisabled={disabled}
                  onClick={() => onChange({ ...value, issueType: type })}
               />
            ))}
         </HStack>
      </HStack>
   );
}
export function BugFieldsForm({
   value,
   onChange,
   disabled,
   showTypeSelector = true,
}: {
   value: BugFields;
   onChange: (value: BugFields) => void;
   disabled?: boolean;
   showTypeSelector?: boolean;
}) {
   const tx = useMessages(messages);
   const enumLabel = useEnumLabel();

   return (
      <DesignSurface>
         <VStack gap={3}>
            {showTypeSelector && (
               <IssueTypeSelector value={value} onChange={onChange} disabled={disabled} />
            )}
            {value.issueType === 'BUG' && (
               <>
                  <VStack gap={2}>
                     <Text type="supporting" weight="medium">
                        {tx('Severity')}
                     </Text>
                     <Select
                        value={value.severity ?? 'NONE'}
                        disabled={disabled}
                        onValueChange={(severity) =>
                           onChange({
                              ...value,
                              severity:
                                 severity === 'NONE' ? null : (severity as BugFields['severity']),
                           })
                        }
                     >
                        <SelectTrigger
                           aria-label={tx('Severity')}
                           className="h-8 w-48 max-w-full rounded-md px-2 text-xs shadow-none"
                        >
                           <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                           {(
                              [
                                 { value: 'NONE', icon: Minus, color: 'text-muted-foreground' },
                                 { value: 'LOW', icon: SignalLow, color: 'text-muted-foreground' },
                                 { value: 'MEDIUM', icon: SignalMedium, color: 'text-foreground' },
                                 { value: 'HIGH', icon: SignalHigh, color: 'text-primary' },
                                 {
                                    value: 'CRITICAL',
                                    icon: OctagonAlert,
                                    color: 'text-destructive',
                                 },
                              ] as const
                           ).map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                 <HStack as="span" gap={2} align="center">
                                    <option.icon
                                       className={`size-4 ${option.color}`}
                                       aria-hidden="true"
                                    />
                                    {option.value === 'NONE'
                                       ? tx('Unspecified')
                                       : enumLabel(option.value)}
                                 </HStack>
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                  </VStack>
                  <TextInput
                     label={tx('Environment')}
                     value={value.environment ?? ''}
                     onChange={(environment) => onChange({ ...value, environment })}
                     isDisabled={disabled}
                  />
                  <TextArea
                     label={tx('Steps to reproduce')}
                     value={value.reproductionSteps ?? ''}
                     onChange={(reproductionSteps) => onChange({ ...value, reproductionSteps })}
                     isDisabled={disabled}
                     maxLength={10000}
                  />
                  <TextArea
                     label={tx('Expected result')}
                     value={value.expectedResult ?? ''}
                     onChange={(expectedResult) => onChange({ ...value, expectedResult })}
                     isDisabled={disabled}
                     maxLength={10000}
                  />
                  <TextArea
                     label={tx('Actual result')}
                     value={value.actualResult ?? ''}
                     onChange={(actualResult) => onChange({ ...value, actualResult })}
                     isDisabled={disabled}
                     maxLength={10000}
                  />
               </>
            )}
         </VStack>
      </DesignSurface>
   );
}
