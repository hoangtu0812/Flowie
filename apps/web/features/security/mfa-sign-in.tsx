'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/security/messages.vi';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Selector } from '@astryxdesign/core/Selector';
import { AuthCard } from '@/components/auth/auth-card';
import { responseData } from '@/lib/http';
import { authApi } from './types';
import { useFactorOptions, type FactorKind } from './mfa-client';

export default function MfaSignIn() {
   const tx = useMessages(messages);
   const factorOptions = useFactorOptions();

   const [kind, setKind] = useState<FactorKind>('AUTHENTICATOR'),
      [code, setCode] = useState(''),
      [error, setError] = useState(''),
      [busy, setBusy] = useState(false);
   async function submit(event: FormEvent) {
      event.preventDefault();
      setBusy(true);
      setError('');
      try {
         const data = await responseData<{
            next: string | null;
            workspace: { slug: string } | null;
            user: { isPlatformAdmin: boolean };
         }>(
            await fetch(`${authApi}/mfa/verify`, {
               method: 'POST',
               credentials: 'include',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ code, kind }),
            })
         );
         setCode('');
         // The authenticated document must not reuse redirects prefetched before MFA completed.
         window.location.replace(data.next ?? '/');
      } catch (reason) {
         setError(reason instanceof Error ? reason.message : tx('Verification failed.'));
      } finally {
         setBusy(false);
      }
   }
   return (
      <AuthCard
         title={tx('Verify your sign-in')}
         description={tx(
            'Enter a code from your authenticator app or one unused recovery code. This sign-in request expires after five minutes.'
         )}
         loading={busy}
         footer={<Link href="/auth/login">{tx('Start sign-in again')}</Link>}
      >
         <VStack as="form" onSubmit={submit} gap={4} width="100%">
            <Selector
               label={tx('Verification method')}
               value={kind}
               options={factorOptions}
               onChange={(value) => {
                  setKind(value as FactorKind);
                  setCode('');
               }}
               width="100%"
            />
            <TextInput
               label={tx('Verification code')}
               value={code}
               onChange={setCode}
               htmlName="one-time-code"
               isRequired
               width="100%"
            />
            {error && <Text role="alert">{error}</Text>}
            <Button
               type="submit"
               label={tx('Verify sign-in')}
               isLoading={busy}
               isDisabled={!code || busy}
            />
         </VStack>
      </AuthCard>
   );
}
