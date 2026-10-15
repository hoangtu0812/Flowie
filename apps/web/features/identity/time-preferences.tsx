'use client';
import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { TextInput } from '@astryxdesign/core/TextInput';
import { useUiPreferencesStore } from '@/store/ui-preferences-store';
import { useMessages } from '@/features/shared/use-messages';
import { resolvedTimezone } from '@/features/shared/account-time';
import { preferenceMessages } from './preference-messages';
export function TimePreferences() {
   const state = useUiPreferencesStore(),
      tx = useMessages(preferenceMessages);
   const [zone, setZone] = useState(state.timezone ?? ''),
      [error, setError] = useState(false);
   useEffect(() => {
      setZone(state.timezone ?? '');
      setError(false);
   }, [state.timezone]);
   return (
      <VStack gap={3} width="100%">
         <Selector
            label={tx('Week starts on')}
            value={String(state.weekStart)}
            options={[
               { value: '1', label: tx('Monday') },
               { value: '0', label: tx('Sunday') },
               { value: '6', label: tx('Saturday') },
            ]}
            onChange={(value) => state.setWeekStart(Number(value) as 0 | 1 | 6)}
            width="100%"
         />
         <TextInput
            label={tx('Account timezone')}
            description={tx('Use an IANA name such as Asia/Ho_Chi_Minh.')}
            value={zone}
            onChange={(value) => {
               setZone(value);
               setError(false);
            }}
            width="100%"
         />
         {error && <Text role="alert">{tx('Enter a recognized IANA timezone.')}</Text>}
         <Text>{tx('Current timezone: {zone}', { zone: resolvedTimezone(state.timezone) })}</Text>
         <HStack gap={2} wrap="wrap">
            <Button
               label={tx('Apply timezone')}
               onClick={() => {
                  try {
                     const value = zone.trim();
                     new Intl.DateTimeFormat('en', { timeZone: value }).format();
                     state.setTimezone(value === 'Asia/Saigon' ? 'Asia/Ho_Chi_Minh' : value);
                  } catch {
                     setError(true);
                  }
               }}
            />
            <Button
               label={tx('Use browser timezone')}
               onClick={() => {
                  state.setTimezone(null);
                  setZone('');
                  setError(false);
               }}
            />
         </HStack>
      </VStack>
   );
}
