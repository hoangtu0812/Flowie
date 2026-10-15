'use client';
import { useEffect, useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Text, Heading } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { Selector } from '@astryxdesign/core/Selector';
import { Token } from '@astryxdesign/core/Token';
import { authApi } from './types';
import {
   mfaRequest,
   factorOptions,
   type Enrollment,
   type MfaStatus,
   type FactorKind,
} from './mfa-client';

export function Authenticator({ org, onChanged }: { org: string; onChanged: () => void }) {
   const [status, setStatus] = useState<MfaStatus>(),
      [enrollment, setEnrollment] = useState<Enrollment>(),
      [password, setPassword] = useState(''),
      [code, setCode] = useState(''),
      [kind, setKind] = useState<FactorKind>('AUTHENTICATOR'),
      [codes, setCodes] = useState<string[]>([]),
      [action, setAction] = useState<'disable' | 'recovery-codes'>(),
      [error, setError] = useState(''),
      [busy, setBusy] = useState(false),
      [retry, setRetry] = useState(0);
   useEffect(() => {
      let active = true;
      void mfaRequest<MfaStatus>('')
         .then((value) => {
            if (active) {
               setStatus(value);
               setError('');
            }
         })
         .catch((reason) => {
            if (active) setError(String(reason));
         });
      return () => {
         active = false;
      };
   }, [retry]);
   async function run(operation: () => Promise<void>) {
      setBusy(true);
      setError('');
      try {
         await operation();
      } catch (reason) {
         setError(reason instanceof Error ? reason.message : 'Verification failed.');
      } finally {
         setBusy(false);
      }
   }
   const refresh = () => {
      setRetry((value) => value + 1);
      onChanged();
      setCode('');
      setPassword('');
   };
   return (
      <VStack as="section" aria-label="Authenticator settings" width="100%" gap={4}>
         <Heading level={2}>Two-step verification</Heading>
         <Text>
            Protect password and Microsoft sign-ins with an authenticator app. Existing integration
            tokens keep their scoped grants; manage them under Credentials.
         </Text>
         {error && <Text role="alert">{error}</Text>}
         <Button
            label="Refresh authenticator status"
            onClick={() => setRetry((value) => value + 1)}
            isDisabled={busy}
         />
         {!status ? (
            <Text>Loading authenticator settings…</Text>
         ) : (
            <>
               <Token
                  label={status.enabled ? 'Authenticator enabled' : 'Authenticator off'}
                  color={status.enabled ? 'green' : 'default'}
               />
               {status.enabled && <Text>{status.recoveryRemaining} recovery codes remain.</Text>}
               {!status.available && (
                  <Text>
                     Authenticator encryption keys are not configured. Enrollment is unavailable;
                     existing factors still require verification. Recovery codes remain usable.
                  </Text>
               )}
               {codes.length > 0 ? (
                  <VStack gap={3}>
                     <Heading level={3}>Save your recovery codes</Heading>
                     <Text>
                        These codes are shown once. Store them securely outside this browser. Each
                        code works once.
                     </Text>
                     <VStack
                        as="pre"
                        className="overflow-auto font-mono"
                        aria-label="Recovery codes"
                     >
                        {codes.join('\n')}
                     </VStack>
                     <HStack gap={2} wrap="wrap">
                        <Button
                           label="Copy recovery codes"
                           onClick={() =>
                              void run(async () => {
                                 await navigator.clipboard.writeText(codes.join('\n'));
                              })
                           }
                        />
                        <Button label="I saved these codes" onClick={() => setCodes([])} />
                     </HStack>
                  </VStack>
               ) : (
                  <>
                     {(enrollment || action || !status.enabled) && (
                        <VStack gap={3}>
                           {status.hasPassword ? (
                              <TextInput
                                 label="Confirm account password"
                                 type="password"
                                 htmlName="password"
                                 value={password}
                                 onChange={setPassword}
                                 width="100%"
                              />
                           ) : (
                              <>
                                 <Text>
                                    A Microsoft sign-in within the last five minutes is required.
                                    Completing a background token refresh does not renew this proof.
                                 </Text>
                                 <Button
                                    label="Verify with Microsoft"
                                    variant="ghost"
                                    href={`${authApi}/microsoft/start?reauth=true&next=${encodeURIComponent(`/${org}/settings/security`)}`}
                                 />
                              </>
                           )}
                        </VStack>
                     )}
                     {!status.enabled && !enrollment && (
                        <Button
                           label="Set up authenticator"
                           isDisabled={!status.available || busy}
                           onClick={() =>
                              void run(async () => {
                                 setEnrollment(
                                    await mfaRequest<Enrollment>('/setup', {
                                       password: password || null,
                                    })
                                 );
                                 setCode('');
                              })
                           }
                        />
                     )}
                     {enrollment && (
                        <VStack gap={3}>
                           <Text>
                              Scan this QR code in your authenticator app or enter the setup key.
                              Expires at {new Date(enrollment.expiresAt).toLocaleTimeString()}.
                           </Text>
                           {/* The QR must retain its complete quiet zone; an attachment thumbnail crops it. */}
                           {/* eslint-disable-next-line @next/next/no-img-element */}
                           <img
                              src={enrollment.qr}
                              alt="Authenticator setup QR code"
                              className="max-w-full self-start"
                           />
                           <TextInput
                              label="Authenticator setup key"
                              value={enrollment.secret}
                              isReadOnly
                              width="100%"
                           />
                           <TextInput
                              label="Authenticator verification code"
                              value={code}
                              onChange={setCode}
                              htmlName="one-time-code"
                              width="100%"
                           />
                           <HStack gap={2} wrap="wrap">
                              <Button
                                 label="Enable authenticator"
                                 isDisabled={busy || !code}
                                 onClick={() =>
                                    void run(async () => {
                                       const result = await mfaRequest<{ recoveryCodes: string[] }>(
                                          '/enable',
                                          { password: password || null, code }
                                       );
                                       setCodes(result.recoveryCodes);
                                       setEnrollment(undefined);
                                       refresh();
                                    })
                                 }
                              />
                              <Button
                                 label="Discard setup key"
                                 isDisabled={busy}
                                 onClick={() => {
                                    setEnrollment(undefined);
                                    setCode('');
                                    setPassword('');
                                 }}
                              />
                           </HStack>
                        </VStack>
                     )}
                     {status.enabled && !action && (
                        <HStack gap={2} wrap="wrap">
                           <Button
                              label="Replace recovery codes"
                              isDisabled={busy}
                              onClick={() => {
                                 setAction('recovery-codes');
                                 setCode('');
                              }}
                           />
                           <Button
                              label="Disable authenticator"
                              isDisabled={busy}
                              onClick={() => {
                                 setAction('disable');
                                 setCode('');
                              }}
                           />
                        </HStack>
                     )}
                     {action && (
                        <VStack gap={3}>
                           <Text>
                              {action === 'disable'
                                 ? 'Disable two-step verification and revoke other browser sessions?'
                                 : 'Replace all remaining recovery codes and revoke other browser sessions? Previous codes will stop working.'}
                           </Text>
                           <Selector
                              label="Verification method"
                              value={kind}
                              options={factorOptions}
                              onChange={(value) => setKind(value as FactorKind)}
                              width="100%"
                           />
                           <TextInput
                              label="Verification code"
                              value={code}
                              onChange={setCode}
                              htmlName="one-time-code"
                              width="100%"
                           />
                           <HStack gap={2} wrap="wrap">
                              <Button
                                 label="Confirm security change"
                                 isDisabled={busy || !code}
                                 onClick={() =>
                                    void run(async () => {
                                       const result = await mfaRequest<{ recoveryCodes: string[] }>(
                                          `/${action}`,
                                          { password: password || null, code, kind }
                                       );
                                       setCodes(result.recoveryCodes);
                                       setAction(undefined);
                                       refresh();
                                    })
                                 }
                              />
                              <Button
                                 label="Cancel security change"
                                 isDisabled={busy}
                                 onClick={() => {
                                    setAction(undefined);
                                    setCode('');
                                    setPassword('');
                                 }}
                              />
                           </HStack>
                        </VStack>
                     )}
                  </>
               )}
            </>
         )}
      </VStack>
   );
}
