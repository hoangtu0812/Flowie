'use client';
import { useDateFormatter } from '@/features/shared/account-time';
import { useLocale } from '@/features/shared/use-locale';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/security/messages.vi';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Token } from '@astryxdesign/core/Token';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { ResourcePagination } from '@/features/shared/resource-pagination';
import { RefreshIconButton } from '@/features/shared/refresh-icon-button';
import { SettingsRow, SettingsSection } from '@/components/common/settings/shared';
import { securityApi, authApi, deviceLabel, type AccountSession } from './types';
import { ConfirmRow } from './confirm-row';

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
         <SettingsSection
            title={tx('Signed-in devices')}
            description={tx(
               'Revocation blocks subsequent API requests even if an access token has not expired. Realtime connections recheck session access within 15 seconds. Device names are reported by the browser; the last refresh time is not continuous activity tracking.'
            )}
         >
            <div className="flex flex-wrap items-center gap-2">
               <Button
                  label={tx('Revoke other devices')}
                  size="sm"
                  variant="secondary"
                  onClick={() => setSelected('others')}
                  isDisabled={busy}
               />
               <RefreshIconButton
                  label={tx('Refresh devices')}
                  onClick={sessions.reload}
                  isDisabled={busy}
               />
            </div>
            {selected && (
               <ConfirmRow
                  question={
                     selected === 'others'
                        ? tx('Sign out other devices now?')
                        : `Sign out ${deviceLabel(selected.userAgent)} now?`
                  }
                  confirmLabel={tx('Confirm device revocation')}
                  cancelLabel={tx('Cancel device revocation')}
                  busy={busy}
                  onConfirm={() => void revoke()}
                  onCancel={() => setSelected(undefined)}
               />
            )}
            {error && <Text role="alert">{error}</Text>}
            {success && <Text role="status">{success}</Text>}
            {sessions.items.length > 0 && (
               <ul className="rounded-lg border bg-container divide-y divide-border/60">
                  {sessions.items.map((row) => (
                     <li key={row.id}>
                        <SettingsRow
                           wrap
                           title={
                              <>
                                 <span>{deviceLabel(row.userAgent, locale)}</span>
                                 {row.current && (
                                    <Token label={tx('Current device')} color="green" size="sm" />
                                 )}
                              </>
                           }
                           description={tx(
                              '{value0} · {value1} · Signed in {value2} · Last refresh {value3}',
                              {
                                 value0: row.ipAddress ?? tx('Unknown network'),
                                 value1: row.method,
                                 value2: securityDate(row.createdAt),
                                 value3: securityDate(row.lastUsedAt),
                              }
                           )}
                           trailing={
                              !row.current && (
                                 <Button
                                    label={tx('Revoke this device')}
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => setSelected(row)}
                                    isDisabled={busy}
                                 />
                              )
                           }
                        />
                     </li>
                  ))}
               </ul>
            )}
            <ResourcePagination count={sessions.items.length} {...sessions} label={tx('devices')} />
         </SettingsSection>
      </VStack>
   );
}
