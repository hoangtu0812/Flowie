'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { VStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { Tab, TabList } from '@astryxdesign/core/TabList';
import { DesignSurface } from '@/components/common/design-surface';
import { RecoveryScreen } from '@/features/shared/recovery-screen';
import { loadCurrentUser } from '@/features/identity/current-user';
import { DeviceSessions } from './device-sessions';
import { LoginHistory } from './login-history';
import { CredentialInventory } from './credential-inventory';
import { Authenticator } from './authenticator';

export default function AccountSecurity() {
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
            title="Account security unavailable"
            message={error}
            retry={() => setRetry((value) => value + 1)}
         />
      );
   if (!account)
      return (
         <DesignSurface>
            <VStack padding={6}>
               <Text>Loading account security…</Text>
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
   const [revision, setRevision] = useState(0);
   const [tab, setTab] = useState('devices');
   const changed = () => setRevision((value) => value + 1);
   return (
      <VStack padding={6} gap={6} width="100%" className="h-full overflow-auto">
         <Heading level={1}>Security &amp; access</Heading>
         <TabList role="tablist" value={tab} onChange={setTab} hasDivider>
            <Tab value="devices" label="Devices" panelId="security-devices" />
            <Tab value="history" label="History" panelId="security-history" />
            <Tab value="credentials" label="Credentials" panelId="security-credentials" />
            <Tab value="authenticator" label="Authenticator" panelId="security-authenticator" />
         </TabList>
         <VStack
            id="security-devices"
            role="tabpanel"
            aria-label="Devices"
            width="100%"
            className={tab === 'devices' ? undefined : 'hidden'}
         >
            <DeviceSessions revision={String(revision)} onChanged={changed} />
         </VStack>
         <VStack
            id="security-authenticator"
            role="tabpanel"
            aria-label="Authenticator"
            width="100%"
            className={tab === 'authenticator' ? undefined : 'hidden'}
         >
            {tab === 'authenticator' && <Authenticator org={org} onChanged={changed} />}
         </VStack>
         <VStack
            id="security-history"
            role="tabpanel"
            aria-label="History"
            width="100%"
            className={tab === 'history' ? undefined : 'hidden'}
         >
            <LoginHistory revision={String(revision)} />
         </VStack>
         <VStack
            id="security-credentials"
            role="tabpanel"
            aria-label="Credentials"
            width="100%"
            className={tab === 'credentials' ? undefined : 'hidden'}
         >
            <CredentialInventory org={org} revision={String(revision)} onChanged={changed} />
         </VStack>
      </VStack>
   );
}
