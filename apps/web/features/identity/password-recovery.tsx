'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Heading, Text } from '@astryxdesign/core/Text';
import { DesignSurface } from '@/components/common/design-surface';
import { responseData } from '@/lib/http';
import { SubmissionGate } from '@/features/shared/submission-gate';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export function PasswordRecovery({ confirm = false }: { confirm?: boolean }) {
   const [email, setEmail] = useState('');
   const [password, setPassword] = useState('');
   const [repeated, setRepeated] = useState('');
   const [token, setToken] = useState('');
   const [enabled, setEnabled] = useState<boolean>();
   const [error, setError] = useState<string>();
   const [message, setMessage] = useState<string>();
   const [sending, setSending] = useState(false);
   const gate = useRef(new SubmissionGate());
   useEffect(() => {
      if (confirm) {
         setToken(new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
         window.history.replaceState(window.history.state, '', window.location.pathname);
         return;
      }
      let active = true;
      fetch(`${api}/auth/password-reset/configuration`)
         .then(responseData<{ enabled: boolean }>)
         .then((result) => {
            if (active) setEnabled(result.enabled);
         })
         .catch((reason) => {
            if (active) setError(reason.message);
         });
      return () => {
         active = false;
      };
   }, [confirm]);
   const submit = () =>
      gate.current.run(async () => {
         setError(undefined);
         if (confirm && (password.length < 12 || password !== repeated)) {
            setError('Use at least 12 characters and enter the same password twice.');
            return;
         }
         setSending(true);
         try {
            const result = await responseData<{ message: string }>(
               await fetch(`${api}/auth/password-reset/${confirm ? 'confirm' : 'request'}`, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify(confirm ? { token, password } : { email }),
               })
            );
            setMessage(result.message);
            setPassword('');
            setRepeated('');
            if (confirm) setToken('');
         } catch (reason) {
            setError(
               reason instanceof Error ? reason.message : 'Could not process password recovery.'
            );
         } finally {
            setSending(false);
         }
      });
   return (
      <DesignSurface>
         <VStack as="main" minHeight="100svh" align="center" justify="center" padding={6}>
            <VStack
               as="form"
               maxWidth={440}
               width="100%"
               gap={4}
               onSubmit={(event) => {
                  event.preventDefault();
                  void submit();
               }}
            >
               <Heading level={1}>
                  {confirm ? 'Set a new password' : 'Recover your account'}
               </Heading>
               {message ? (
                  <Text role="status">{message}</Text>
               ) : confirm ? (
                  <>
                     {!token && (
                        <Text role="alert">
                           Open the complete reset link from your email. The token is kept only in
                           this page session.
                        </Text>
                     )}
                     <TextInput
                        label="New password"
                        type="password"
                        value={password}
                        onChange={setPassword}
                        isRequired
                        isDisabled={sending}
                     />
                     <TextInput
                        label="Repeat new password"
                        type="password"
                        value={repeated}
                        onChange={setRepeated}
                        isRequired
                        isDisabled={sending}
                     />
                     <Text>
                        At least 12 characters. Previous sessions and API/MCP tokens will be
                        revoked.
                     </Text>
                  </>
               ) : (
                  <>
                     {enabled === undefined && !error && (
                        <Text role="status">Checking recovery availability…</Text>
                     )}
                     {enabled === false && (
                        <Text role="status">
                           Password recovery email is not configured. Contact your workspace
                           administrator.
                        </Text>
                     )}
                     <TextInput
                        label="Email"
                        type="email"
                        value={email}
                        onChange={setEmail}
                        isRequired
                        isDisabled={sending || !enabled}
                     />
                  </>
               )}
               {error && <Text role="alert">{error}</Text>}
               {!message && (
                  <Button
                     label={confirm ? 'Reset password' : 'Send reset link'}
                     type="submit"
                     isLoading={sending}
                     isDisabled={confirm ? !token : !enabled}
                     variant="primary"
                  />
               )}
               <Link href="/auth/login">Back to sign in</Link>
               {confirm && <Link href="/auth/forgot-password">Request a new reset link</Link>}
            </VStack>
         </VStack>
      </DesignSurface>
   );
}
