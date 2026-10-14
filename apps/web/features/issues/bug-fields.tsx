'use client';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TextArea } from '@astryxdesign/core/TextArea';
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
export function BugFieldsForm({
   value,
   onChange,
   disabled,
}: {
   value: BugFields;
   onChange: (value: BugFields) => void;
   disabled?: boolean;
}) {
   return (
      <DesignSurface>
         <VStack gap={3}>
            <HStack gap={2}>
               <Text>Issue type</Text>
               {(['TASK', 'BUG'] as const).map((type) => (
                  <Button
                     key={type}
                     label={type === 'BUG' ? 'Bug' : 'Task'}
                     aria-pressed={(value.issueType ?? 'TASK') === type}
                     variant={(value.issueType ?? 'TASK') === type ? 'primary' : 'secondary'}
                     isDisabled={disabled}
                     onClick={() => onChange({ ...value, issueType: type })}
                  />
               ))}
            </HStack>
            {value.issueType === 'BUG' && (
               <>
                  <Text>Severity</Text>
                  <HStack gap={2} wrap="wrap">
                     {([null, 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const).map((severity) => (
                        <Button
                           key={severity ?? 'NONE'}
                           label={severity ?? 'Unspecified'}
                           aria-pressed={value.severity === severity}
                           variant={value.severity === severity ? 'primary' : 'secondary'}
                           isDisabled={disabled}
                           onClick={() => onChange({ ...value, severity })}
                        />
                     ))}
                  </HStack>
                  <TextInput
                     label="Environment"
                     value={value.environment ?? ''}
                     onChange={(environment) => onChange({ ...value, environment })}
                     isDisabled={disabled}
                  />
                  <TextArea
                     label="Steps to reproduce"
                     value={value.reproductionSteps ?? ''}
                     onChange={(reproductionSteps) => onChange({ ...value, reproductionSteps })}
                     isDisabled={disabled}
                     maxLength={10000}
                  />
                  <TextArea
                     label="Expected result"
                     value={value.expectedResult ?? ''}
                     onChange={(expectedResult) => onChange({ ...value, expectedResult })}
                     isDisabled={disabled}
                     maxLength={10000}
                  />
                  <TextArea
                     label="Actual result"
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
