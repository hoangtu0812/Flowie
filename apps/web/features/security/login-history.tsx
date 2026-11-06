'use client';
import { useDateFormatter } from '@/features/shared/account-time';
import { useLocale } from '@/features/shared/use-locale';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/security/messages.vi';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Selector } from '@astryxdesign/core/Selector';
import { RefreshIconButton } from '@/features/shared/refresh-icon-button';
import { SettingsSection } from '@/components/common/settings/shared';
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
         <SettingsSection
            title={tx('Sign-in and security history')}
            description={tx(
               'Your own account events from the last 30 days. Earlier sign-ins are not reconstructed. Network and browser details describe requests, not verified physical devices.'
            )}
         >
            <div className="flex flex-wrap items-center gap-2">
               <Selector
                  label={tx('Security event filter')}
                  isLabelHidden
                  size="sm"
                  width={220}
                  value={kind}
                  options={[
                     { value: '', label: tx('All security events') },
                     ...Object.entries(labels).map(([value, label]) => ({ value, label })),
                  ]}
                  onChange={setKind}
               />
               <RefreshIconButton label={tx('Refresh security history')} onClick={history.reload} />
            </div>
            {history.items.length > 0 && (
               // One line per event on desktop: what happened on the left, when/where on the
               // right; the right part wraps under the left on narrow screens.
               // VI: Mỗi event một dòng trên desktop: việc xảy ra bên trái, thời gian/nơi bên
               // phải; phần bên phải xuống dòng dưới phần trái ở màn hình hẹp.
               <ul className="rounded-lg border bg-container divide-y divide-border/60">
                  {history.items.map((row) => (
                     <li
                        key={row.id}
                        className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-4 py-2"
                     >
                        <span className="text-sm font-medium">{`${row.kind.toLowerCase().replaceAll('_', ' ')} · ${row.method}`}</span>
                        <span className="text-xs text-muted-foreground">{`${securityDate(row.createdAt)} · ${deviceLabel(row.userAgent, locale)} · ${row.ipAddress ?? tx('Unknown network')}`}</span>
                     </li>
                  ))}
               </ul>
            )}
            {!history.loading && !history.error && !history.items.length && (
               <Text>{tx('No security events match this filter.')}</Text>
            )}
            <ResourcePagination
               count={history.items.length}
               {...history}
               label={tx('security events')}
            />
         </SettingsSection>
      </VStack>
   );
}
