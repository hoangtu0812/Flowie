'use client';
import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { List, ListItem } from '@astryxdesign/core/List';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { ResourcePagination } from '@/features/shared/resource-pagination';
import { securityApi, deviceLabel, securityDate, type SecurityEvent } from './types';

export function LoginHistory({ revision }: { revision: string }) {
   const [kind, setKind] = useState('');
   const history = usePagedResource<SecurityEvent>(
      `${securityApi}/events?${new URLSearchParams(kind ? { kind } : {})}`,
      revision
   );
   const labels: Record<string, string> = {
      LOGIN_SUCCEEDED: 'Successful sign-ins',
      LOGIN_FAILED: 'Failed sign-ins',
      LOGGED_OUT: 'Sign-outs',
      SESSION_REVOKED: 'Device revocations',
      CREDENTIAL_REVOKED: 'Credential revocations',
      MFA_ENABLED: 'MFA enabled',
      MFA_DISABLED: 'MFA disabled',
      MFA_FAILED: 'Failed verification',
      RECOVERY_USED: 'Recovery codes used',
   };
   return (
      <VStack as="section" aria-label="Security history" gap={3} width="100%">
         <Heading level={2}>Sign-in and security history</Heading>
         <Text>
            Your own account events from the last 30 days. Earlier sign-ins are not reconstructed.
            Network and browser details describe requests, not verified physical devices.
         </Text>
         <Selector
            label="Security event filter"
            value={kind}
            options={[
               { value: '', label: 'All security events' },
               ...Object.entries(labels).map(([value, label]) => ({ value, label })),
            ]}
            onChange={setKind}
            width="100%"
         />
         <Button label="Refresh security history" onClick={history.reload} />
         <List hasDividers>
            {history.items.map((row) => (
               <ListItem
                  key={row.id}
                  label={`${row.kind.toLowerCase().replaceAll('_', ' ')} · ${row.method}`}
                  description={
                     <Text>{`${securityDate(row.createdAt)} · ${deviceLabel(row.userAgent)} · ${row.ipAddress ?? 'Unknown network'}`}</Text>
                  }
               />
            ))}
         </List>
         {!history.loading && !history.error && !history.items.length && (
            <Text>No security events match this filter.</Text>
         )}
         <ResourcePagination count={history.items.length} {...history} label="security events" />
      </VStack>
   );
}
