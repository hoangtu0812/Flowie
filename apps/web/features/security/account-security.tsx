'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/security/messages.vi';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { DesignSurface } from '@/components/common/design-surface';
import { RecoveryScreen } from '@/features/shared/recovery-screen';
import { loadCurrentUser } from '@/features/identity/current-user';
import { DeviceSessions } from './device-sessions';
import { LoginHistory } from './login-history';
import { CredentialInventory } from './credential-inventory';
import { Authenticator } from './authenticator';
import { SettingsShell } from '@/components/common/settings/shared';

export default function AccountSecurity() {
   const tx = useMessages(messages);

   const { orgId } = useParams<{ orgId: string }>();
   const [account, setAccount] = useState(''),
      [error, setError] = useState(''),
      [retry, setRetry] = useState(0);
   useEffect(() => {
      let active = true;
      setError('');
      void loadCurrentUser()
         .then((user) => {
            if (active) setAccount(user.id);
         })
         .catch((reason) => {
            if (active) setError(String(reason));
         });
      return () => {
         active = false;
      };
   }, [retry]);
   if (error)
      return (
         <RecoveryScreen
            title={tx('Account security unavailable')}
            message={error}
            retry={() => setRetry((value) => value + 1)}
         />
      );
   if (!account)
      return (
         <DesignSurface>
            <VStack padding={6}>
               <Text>{tx('Loading account security…')}</Text>
            </VStack>
         </DesignSurface>
      );
   return (
      <DesignSurface>
         <SecurityCenter key={account} org={orgId} />
      </DesignSurface>
   );
}
function SecurityCenter({ org }: { org: string }) {
   const tx = useMessages(messages);

   const [revision, setRevision] = useState(0);
   const [tab, setTab] = useState(tx('devices'));
   const changed = () => setRevision((value) => value + 1);
   return (
      <SettingsShell
         title={tx('Security & access')}
         description={tx('Manage your devices, sign-in history, credentials and authenticator')}
      >
         <VStack gap={6} width="100%">
            <TabList role="tablist" value={tab} onChange={setTab} hasDivider>
               <Tab value={tx('devices')} label={tx('Devices')} panelId="security-devices" />
               <Tab value="history" label={tx('History')} panelId="security-history" />
               <Tab
                  value={tx('credentials')}
                  label={tx('Credentials')}
                  panelId="security-credentials"
               />
               <Tab
                  value="authenticator"
                  label={tx('Authenticator')}
                  panelId="security-authenticator"
               />
            </TabList>
            <VStack
               id="security-devices"
               role="tabpanel"
               aria-label={tx('Devices')}
               width="100%"
               className={tab === tx('devices') ? undefined : 'hidden'}
            >
               <DeviceSessions revision={String(revision)} onChanged={changed} />
            </VStack>
            <VStack
               id="security-authenticator"
               role="tabpanel"
               aria-label={tx('Authenticator')}
               width="100%"
               className={tab === 'authenticator' ? undefined : 'hidden'}
            >
               {tab === 'authenticator' && <Authenticator org={org} onChanged={changed} />}
            </VStack>
            <VStack
               id="security-history"
               role="tabpanel"
               aria-label={tx('History')}
               width="100%"
               className={tab === 'history' ? undefined : 'hidden'}
            >
               <LoginHistory revision={String(revision)} />
            </VStack>
            <VStack
               id="security-credentials"
               role="tabpanel"
               aria-label={tx('Credentials')}
               width="100%"
               className={tab === tx('credentials') ? undefined : 'hidden'}
            >
               <CredentialInventory org={org} revision={String(revision)} onChanged={changed} />
            </VStack>
         </VStack>
      </SettingsShell>
   );
}
