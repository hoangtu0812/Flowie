'use client';
import { useWeekdayLabel } from '@/features/shared/enum-labels';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/sla/messages.vi';

import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { TextArea } from '@astryxdesign/core/TextArea';
import { Text } from '@astryxdesign/core/Text';
import type { BusinessCalendar, WorkingWindow } from './types';

const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export function CalendarEditor({
   value,
   onChange,
   disabled,
}: {
   value: BusinessCalendar;
   onChange: (value: BusinessCalendar) => void;
   disabled: boolean;
}) {
   const tx = useMessages(messages);
   const weekdayLabel = useWeekdayLabel();

   const [holidays, setHolidays] = useState(value.holidays.join('\n'));
   const changeWindow = (index: number, values: Partial<WorkingWindow>) =>
      onChange({
         ...value,
         windows: value.windows.map((row, i) => (i === index ? { ...row, ...values } : row)),
      });
   return (
      <VStack gap={3} width="100%">
         <TextInput
            label={tx('Business timezone')}
            value={value.timezone}
            onChange={(timezone) => onChange({ ...value, timezone })}
            isDisabled={disabled}
            width="100%"
            description={tx(
               'IANA name, such as Asia/Ho_Chi_Minh. Daylight saving changes follow this timezone.'
            )}
         />
         <Text>
            {tx(
               'Working windows use local time. Split overnight work into separate windows. Use 24:00 for the end of a day.'
            )}
         </Text>
         {value.windows.map((row, index) => (
            <VStack key={index} gap={2} width="100%">
               <Selector
                  label={tx('Window {value0} weekday', { value0: index + 1 })}
                  value={String(row.weekday)}
                  options={days.map((label, i) => ({ value: String(i), label: weekdayLabel(i) }))}
                  onChange={(day) => changeWindow(index, { weekday: Number(day) })}
                  isDisabled={disabled}
                  width="100%"
               />
               <HStack gap={2} wrap="wrap" width="100%">
                  <TextInput
                     label={tx('Window {value0} start', { value0: index + 1 })}
                     value={row.start}
                     onChange={(start) => changeWindow(index, { start })}
                     isDisabled={disabled}
                  />
                  <TextInput
                     label={tx('Window {value0} end', { value0: index + 1 })}
                     value={row.end}
                     onChange={(end) => changeWindow(index, { end })}
                     isDisabled={disabled}
                  />
                  <Button
                     label={tx('Remove window {value0}', { value0: index + 1 })}
                     onClick={() =>
                        onChange({ ...value, windows: value.windows.filter((_, i) => i !== index) })
                     }
                     isDisabled={disabled || value.windows.length === 1}
                  />
               </HStack>
            </VStack>
         ))}
         <Button
            label={tx('Add working window')}
            onClick={() =>
               onChange({
                  ...value,
                  windows: [...value.windows, { weekday: 0, start: '09:00', end: '17:00' }],
               })
            }
            isDisabled={disabled || value.windows.length >= 28}
         />
         <TextArea
            label={tx('Holiday dates')}
            value={holidays}
            onChange={(text) => {
               setHolidays(text);
               onChange({ ...value, holidays: text.split(/[\s,]+/).filter(Boolean) });
            }}
            description={tx('One YYYY-MM-DD date per line. These dates have no working hours.')}
            rows={4}
            width="100%"
            isDisabled={disabled}
         />
      </VStack>
   );
}
