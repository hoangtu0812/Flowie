'use client';
import { useDateFormatter } from '@/features/shared/account-time';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/security/messages.vi';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Token } from '@astryxdesign/core/Token';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { usePagedResource } from '@/features/shared/use-paged-resource';
import { ResourcePagination } from '@/features/shared/resource-pagination';
import { RefreshIconButton } from '@/features/shared/refresh-icon-button';
import { SettingsRow, SettingsSection } from '@/components/common/settings/shared';
import { securityApi, type Credential } from './types';
import { ConfirmRow } from './confirm-row';

export function CredentialInventory({
   org,
   revision,
   onChanged,
}: {
   org: string;
   revision: string;
   onChanged: () => void;
}) {
   const tx = useMessages(messages);
   const securityDate = useDateFormatter();

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
      <VStack as="section" aria-label={tx('Credential inventory')} gap={3} width="100%">
         <SettingsSection
            title={tx('Your integration credentials')}
            description={tx(
               'Scoped AI connections keep their explicit tool/team/project grants and can be revoked independently of browser devices. Legacy personal API keys are retired and are not accepted by the current API. Existing entries remain available for revocation.'
            )}
         >
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
               <CheckboxInput
                  label={tx('Include revoked credentials')}
                  value={revoked}
                  onChange={(value) => {
                     setRevoked(value);
                     setSelected(undefined);
                  }}
                  isDisabled={busy}
               />
               <div className="ml-auto flex items-center gap-2">
                  <Button
                     label={tx('Manage scoped AI connections')}
                     size="sm"
                     variant="secondary"
                     href={`/${org}/settings/integrations`}
                  />
                  <RefreshIconButton
                     label={tx('Refresh credentials')}
                     onClick={credentials.reload}
                     isDisabled={busy}
                  />
               </div>
            </div>
            {selected && (
               <ConfirmRow
                  question={tx(
                     'Revoke {value0}? Applications holding this credential will lose its access.',
                     { value0: selected.name }
                  )}
                  confirmLabel={tx('Confirm credential revocation')}
                  cancelLabel={tx('Cancel credential revocation')}
                  busy={busy}
                  onConfirm={() => void revoke()}
                  onCancel={() => setSelected(undefined)}
               />
            )}
            {error && <Text role="alert">{error}</Text>}
            {credentials.items.length > 0 && (
               <ul className="rounded-lg border bg-container divide-y divide-border/60">
                  {credentials.items.map((row) => {
                     const state = row.revokedAt
                        ? 'Revoked'
                        : row.kind === 'LEGACY_API_KEY'
                          ? 'Retired'
                          : row.expiresAt && new Date(row.expiresAt).getTime() <= Date.now()
                            ? 'Expired'
                            : 'Active';
                     return (
                        <li key={row.id}>
                           <SettingsRow
                              wrap
                              title={
                                 <>
                                    <span>{row.name}</span>
                                    <Token
                                       size="sm"
                                       label={tx(state)}
                                       color={state === 'Active' ? 'green' : 'default'}
                                    />
                                    <span className="font-mono text-xs font-normal text-muted-foreground">
                                       {row.prefix}
                                    </span>
                                 </>
                              }
                              description={
                                 <div className="flex flex-col gap-1.5 mt-1">
                                    {row.kind === 'MCP' ? (
                                       // Scopes render as small chips that wrap, instead of one long
                                       // comma-separated sentence.
                                       // VI: Scope hiển thị thành các chip nhỏ tự xuống dòng thay
                                       // cho một câu dài ngăn cách bằng dấu phẩy.
                                       <div className="flex flex-wrap items-center gap-1">
                                          <span className="mr-1">
                                             {row.workspaceName ?? tx('Unavailable workspace')}
                                          </span>
                                          {row.scopes.map((scope) => (
                                             <Token
                                                key={scope}
                                                label={scope}
                                                size="sm"
                                                color="gray"
                                             />
                                          ))}
                                       </div>
                                    ) : (
                                       <span>{tx('Legacy personal API key')}</span>
                                    )}
                                    <span>
                                       {tx(
                                          'Created {value0} · Expires {value1} · Last used {value2}',
                                          {
                                             value0: securityDate(row.createdAt),
                                             value1: row.expiresAt
                                                ? securityDate(row.expiresAt)
                                                : tx('No expiry'),
                                             value2: row.lastUsedAt
                                                ? securityDate(row.lastUsedAt)
                                                : tx('Not recorded'),
                                          }
                                       )}
                                    </span>
                                 </div>
                              }
                              trailing={
                                 !row.revokedAt && (
                                    <Button
                                       label={tx('Revoke credential')}
                                       size="sm"
                                       variant="secondary"
                                       onClick={() => setSelected(row)}
                                       isDisabled={busy}
                                    />
                                 )
                              }
                           />
                        </li>
                     );
                  })}
               </ul>
            )}
            {!credentials.loading && !credentials.error && !credentials.items.length && (
               <Text>{tx('No credentials match this filter.')}</Text>
            )}
            <ResourcePagination
               count={credentials.items.length}
               {...credentials}
               label={tx('credentials')}
            />
         </SettingsSection>
      </VStack>
   );
}
