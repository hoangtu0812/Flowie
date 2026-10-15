'use client';
import { useDateFormatter } from '@/features/shared/account-time';
import { useLocale } from '@/features/shared/use-locale';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/security/messages.vi';

import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { List, ListItem } from '@astryxdesign/core/List';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { ResourcePagination } from '@/features/shared/resource-pagination';
import { securityApi, deviceLabel, type SecurityEvent } from './types';

export function LoginHistory({ revision }: { revision: string }) {
   const tx = useMessages(messages);
   const { locale } = useLocale();
   const securityDate = useDateFormatter();

   const [kind, setKind] = useState('');
   const history = usePagedResource<SecurityEvent>(
      `${securityApi}/events?${new URLSearchParams(kind ? { kind } : {})}`,
      revision
   );
   const labels: Record<string, string> = {
      LOGIN_SUCCEEDED: tx('Successful sign-ins'),
      LOGIN_FAILED: tx('Failed sign-ins'),
      LOGGED_OUT: tx('Sign-outs'),
      SESSION_REVOKED: tx('Device revocations'),
      CREDENTIAL_REVOKED: tx('Credential revocations'),
      MFA_ENABLED: tx('MFA enabled'),
      MFA_DISABLED: tx('MFA disabled'),
      MFA_FAILED: tx('Failed verification'),
      MFA_VERIFIED: tx('Successful MFA verification'),
      MFA_RECOVERY_REPLACED: tx('Recovery codes replaced'),
      MFA_CHALLENGE_STARTED: tx('MFA challenges'),
      MFA_SETUP_STARTED: tx('Authenticator setup'),
   };
   return (
      <VStack as="section" aria-label={tx('Security history')} gap={3} width="100%">
         <Heading level={2}>{tx('Sign-in and security history')}</Heading>
         <Text>
            {tx(
               'Your own account events from the last 30 days. Earlier sign-ins are not reconstructed. Network and browser details describe requests, not verified physical devices.'
            )}
         </Text>
         <Selector
            label={tx('Security event filter')}
            value={kind}
            options={[
               { value: '', label: tx('All security events') },
               ...Object.entries(labels).map(([value, label]) => ({ value, label })),
            ]}
            onChange={setKind}
            width="100%"
         />
         <Button label={tx('Refresh security history')} onClick={history.reload} />
         <List hasDividers>
            {history.items.map((row) => (
               <ListItem
                  key={row.id}
                  label={`${row.kind.toLowerCase().replaceAll('_', ' ')} · ${row.method}`}
                  description={
                     <Text>{`${securityDate(row.createdAt)} · ${deviceLabel(row.userAgent, locale)} · ${row.ipAddress ?? tx('Unknown network')}`}</Text>
                  }
               />
            ))}
         </List>
         {!history.loading && !history.error && !history.items.length && (
            <Text>{tx('No security events match this filter.')}</Text>
         )}
         <ResourcePagination
            count={history.items.length}
            {...history}
            label={tx('security events')}
         />
      </VStack>
   );
}
