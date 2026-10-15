'use client';
import { useDateFormatter } from '@/features/shared/account-time';
import { useLocale } from '@/features/shared/use-locale';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/security/messages.vi';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { Token } from '@astryxdesign/core/Token';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { ResourcePagination } from '@/features/shared/resource-pagination';
import { securityApi, authApi, deviceLabel, type AccountSession } from './types';

export function DeviceSessions({
   revision,
   onChanged,
}: {
   revision: string;
   onChanged: () => void;
}) {
   const tx = useMessages(messages);
   const { locale } = useLocale();
   const securityDate = useDateFormatter();

   const sessions = usePagedResource<AccountSession>(securityApi + '/sessions', revision);
   const [selected, setSelected] = useState<AccountSession | 'others'>(),
      [busy, setBusy] = useState(false),
      [error, setError] = useState(''),
      [success, setSuccess] = useState('');
   const alive = useRef(true);
   useEffect(() => {
      alive.current = true;
      return () => {
         alive.current = false;
      };
   }, []);
   const revoke = async () => {
      if (busy || !selected) return;
      setBusy(true);
      setError('');
      setSuccess('');
      try {
         await responseData(
            await authenticatedFetch(
               authApi + '/sessions' + (selected === 'others' ? '' : '/' + selected.id),
               { method: 'DELETE' }
            )
         );
         if (alive.current) {
            setSelected(undefined);
            setSuccess(tx('Sessions revoked.'));
            onChanged();
         }
      } catch (reason) {
         if (alive.current) setError(String(reason));
      } finally {
         if (alive.current) setBusy(false);
      }
   };
   return (
      <VStack as="section" aria-label={tx('Device sessions')} gap={3} width="100%">
         <Heading level={2}>{tx('Signed-in devices')}</Heading>
         <Text>
            {tx(
               'Revocation blocks subsequent API requests even if an access token has not expired. Realtime connections recheck session access within 15 seconds. Device names are reported by the browser; the last refresh time is not continuous activity tracking.'
            )}
         </Text>
         <HStack gap={2} wrap="wrap">
            <Button label={tx('Refresh devices')} onClick={sessions.reload} isDisabled={busy} />
            <Button
               label={tx('Revoke other devices')}
               onClick={() => setSelected('others')}
               isDisabled={busy}
            />
         </HStack>
         {selected && (
            <>
               <Text>
                  {selected === 'others'
                     ? tx('Sign out other devices now?')
                     : `Sign out ${deviceLabel(selected.userAgent)} now?`}
               </Text>
               <HStack gap={2} wrap="wrap">
                  <Button
                     label={tx('Confirm device revocation')}
                     onClick={() => void revoke()}
                     isLoading={busy}
                  />
                  <Button
                     label={tx('Cancel device revocation')}
                     onClick={() => setSelected(undefined)}
                     isDisabled={busy}
                  />
               </HStack>
            </>
         )}
         {error && <Text role="alert">{error}</Text>}
         {success && <Text role="status">{success}</Text>}
         <List hasDividers>
            {sessions.items.map((row) => (
               <ListItem
                  key={row.id}
                  label={deviceLabel(row.userAgent, locale)}
                  description={
                     <VStack gap={2} width="100%">
                        {row.current && <Token label={tx('Current device')} color="green" />}
                        <Text>
                           {tx('{value0} · {value1} · Signed in {value2} · Last refresh {value3}', {
                              value0: row.ipAddress ?? tx('Unknown network'),
                              value1: row.method,
                              value2: securityDate(row.createdAt),
                              value3: securityDate(row.lastUsedAt),
                           })}
                        </Text>
                        {!row.current && (
                           <Button
                              label={tx('Revoke this device')}
                              onClick={() => setSelected(row)}
                              isDisabled={busy}
                           />
                        )}
                     </VStack>
                  }
               />
            ))}
         </List>
         <ResourcePagination count={sessions.items.length} {...sessions} label={tx('devices')} />
      </VStack>
   );
}
