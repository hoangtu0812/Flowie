'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { List, ListItem } from '@astryxdesign/core/List';
import { Token } from '@astryxdesign/core/Token';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { ResourcePagination } from '@/features/shared/resource-pagination';
import { securityApi, securityDate, type Credential } from './types';

export function CredentialInventory({
   org,
   revision,
   onChanged,
}: {
   org: string;
   revision: string;
   onChanged: () => void;
}) {
   const [revoked, setRevoked] = useState(false),
      [selected, setSelected] = useState<Credential>(),
      [busy, setBusy] = useState(false),
      [error, setError] = useState('');
   const credentials = usePagedResource<Credential>(
      `${securityApi}/credentials?includeRevoked=${revoked}`,
      revision
   );
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
      try {
         await responseData(
            await authenticatedFetch(
               `${securityApi}/credentials/${selected.kind}/${selected.credentialId}/revoke`,
               { method: 'POST' }
            )
         );
         if (alive.current) {
            setSelected(undefined);
            onChanged();
         }
      } catch (reason) {
         if (alive.current) setError(String(reason));
      } finally {
         if (alive.current) setBusy(false);
      }
   };
   return (
      <VStack as="section" aria-label="Credential inventory" gap={3} width="100%">
         <Heading level={2}>Your integration credentials</Heading>
         <Text>
            Scoped AI connections keep their explicit tool/team/project grants and can be revoked
            independently of browser devices. Legacy personal API keys are retired and are not
            accepted by the current API. Existing entries remain available for revocation.
         </Text>
         <Button label="Manage scoped AI connections" href={`/${org}/settings/integrations`} />
         <CheckboxInput
            label="Include revoked credentials"
            value={revoked}
            onChange={(value) => {
               setRevoked(value);
               setSelected(undefined);
            }}
            isDisabled={busy}
         />
         <Button label="Refresh credentials" onClick={credentials.reload} isDisabled={busy} />
         {selected && (
            <>
               <Text>{`Revoke ${selected.name}? Applications holding this credential will lose its access.`}</Text>
               <HStack gap={2} wrap="wrap">
                  <Button
                     label="Confirm credential revocation"
                     onClick={() => void revoke()}
                     isLoading={busy}
                  />
                  <Button
                     label="Cancel credential revocation"
                     onClick={() => setSelected(undefined)}
                     isDisabled={busy}
                  />
               </HStack>
            </>
         )}
         {error && <Text role="alert">{error}</Text>}
         <List hasDividers>
            {credentials.items.map((row) => (
               <ListItem
                  key={row.id}
                  label={row.name}
                  description={
                     <VStack gap={2} width="100%">
                        <HStack gap={2} wrap="wrap">
                           <Token
                              label={
                                 row.revokedAt
                                    ? 'Revoked'
                                    : row.kind === 'LEGACY_API_KEY'
                                      ? 'Retired'
                                      : row.expiresAt &&
                                          new Date(row.expiresAt).getTime() <= Date.now()
                                        ? 'Expired'
                                        : 'Active'
                              }
                           />
                           <Text>{row.prefix}</Text>
                        </HStack>
                        <Text>
                           {row.kind === 'MCP'
                              ? `${row.workspaceName ?? 'Unavailable workspace'} · ${row.scopes.join(', ')}`
                              : 'Legacy personal API key'}
                        </Text>
                        <Text>{`Created ${securityDate(row.createdAt)} · Expires ${row.expiresAt ? securityDate(row.expiresAt) : 'No expiry'} · Last used ${row.lastUsedAt ? securityDate(row.lastUsedAt) : 'Not recorded'}`}</Text>
                        {!row.revokedAt && (
                           <Button
                              label="Revoke credential"
                              onClick={() => setSelected(row)}
                              isDisabled={busy}
                           />
                        )}
                     </VStack>
                  }
               />
            ))}
         </List>
         {!credentials.loading && !credentials.error && !credentials.items.length && (
            <Text>No credentials match this filter.</Text>
         )}
         <ResourcePagination
            count={credentials.items.length}
            {...credentials}
            label="credentials"
         />
      </VStack>
   );
}
