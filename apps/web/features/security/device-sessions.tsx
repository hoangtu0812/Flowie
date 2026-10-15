'use client';
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
import { securityApi, authApi, deviceLabel, securityDate, type AccountSession } from './types';

export function DeviceSessions({
   revision,
   onChanged,
}: {
   revision: string;
   onChanged: () => void;
}) {
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
            setSuccess('Sessions revoked.');
            onChanged();
         }
      } catch (reason) {
         if (alive.current) setError(String(reason));
      } finally {
         if (alive.current) setBusy(false);
      }
   };
   return (
      <VStack as="section" aria-label="Device sessions" gap={3} width="100%">
         <Heading level={2}>Signed-in devices</Heading>
         <Text>
            Revocation blocks subsequent API requests even if an access token has not expired.
            Realtime connections recheck session access within 15 seconds. Device names are reported
            by the browser; the last refresh time is not continuous activity tracking.
         </Text>
         <HStack gap={2} wrap="wrap">
            <Button label="Refresh devices" onClick={sessions.reload} isDisabled={busy} />
            <Button
               label="Revoke other devices"
               onClick={() => setSelected('others')}
               isDisabled={busy}
            />
         </HStack>
         {selected && (
            <>
               <Text>
                  {selected === 'others'
                     ? 'Sign out other devices now?'
                     : `Sign out ${deviceLabel(selected.userAgent)} now?`}
               </Text>
               <HStack gap={2} wrap="wrap">
                  <Button
                     label="Confirm device revocation"
                     onClick={() => void revoke()}
                     isLoading={busy}
                  />
                  <Button
                     label="Cancel device revocation"
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
                  label={deviceLabel(row.userAgent)}
                  description={
                     <VStack gap={2} width="100%">
                        {row.current && <Token label="Current device" color="green" />}
                        <Text>{`${row.ipAddress ?? 'Unknown network'} · ${row.method} · Signed in ${securityDate(row.createdAt)} · Last refresh ${securityDate(row.lastUsedAt)}`}</Text>
                        {!row.current && (
                           <Button
                              label="Revoke this device"
                              onClick={() => setSelected(row)}
                              isDisabled={busy}
                           />
                        )}
                     </VStack>
                  }
               />
            ))}
         </List>
         <ResourcePagination count={sessions.items.length} {...sessions} label="devices" />
      </VStack>
   );
}
