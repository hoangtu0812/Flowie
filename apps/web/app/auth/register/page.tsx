'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useLocale } from '@/features/shared/use-locale';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { AuthCard } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordAuthBoundary } from '@/features/identity/auth-providers';

type AuthPayload = {
   data: { workspace: { id: string; slug: string } | null; user: { isPlatformAdmin: boolean } };
};

type VerificationPayload = {
   data: { email: string; expiresAt: string };
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function RegisterPage() {
   return (
      <PasswordAuthBoundary>
         <RegisterForm />
      </PasswordAuthBoundary>
   );
}

function RegisterForm() {
   const { t } = useLocale();
   const router = useRouter();
   const [error, setError] = useState<string | null>(null);
   const [isSubmitting, setIsSubmitting] = useState(false);
   const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
   const [verificationCode, setVerificationCode] = useState('');

   async function responseError(response: Response) {
      const payload = (await response.json().catch(() => null)) as {
         message?: string | string[];
      } | null;
      return Array.isArray(payload?.message) ? payload.message[0] : payload?.message;
   }

   async function onSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const password = String(formData.get('password') ?? '');
      const confirmPassword = String(formData.get('confirmPassword') ?? '');
      if (password !== confirmPassword) {
         setError(t('passwordMismatch'));
         return;
      }

      setError(null);
      setIsSubmitting(true);
      try {
         const response = await fetch(`${apiUrl}/auth/register`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               name: formData.get('name'),
               email: formData.get('email'),
               password,
               timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
         });
         if (!response.ok) {
            throw new Error((await responseError(response)) ?? 'Không thể gửi mã xác thực.');
         }
         const payload = (await response.json()) as VerificationPayload;
         setVerificationEmail(payload.data.email);
      } catch (caughtError) {
         setError(caughtError instanceof Error ? caughtError.message : t('registerFailed'));
      } finally {
         setIsSubmitting(false);
      }
   }

   async function verifyCode(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      if (!verificationEmail) return;
      setError(null);
      setIsSubmitting(true);
      try {
         const response = await fetch(`${apiUrl}/auth/register/verify`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: verificationEmail, code: verificationCode }),
         });
         if (!response.ok) {
            throw new Error((await responseError(response)) ?? t('verifyFailed'));
         }
         const payload = (await response.json()) as AuthPayload;
         router.replace(
            payload.data.user.isPlatformAdmin
               ? '/admin'
               : payload.data.workspace
                 ? `/${payload.data.workspace.id}/teams`
                 : '/'
         );
      } catch (caughtError) {
         setError(caughtError instanceof Error ? caughtError.message : t('verifyFailed'));
      } finally {
         setIsSubmitting(false);
      }
   }

   return (
      <AuthCard
         title={verificationEmail ? t('verifyRegistration') : t('newWorkspace')}
         description={
            verificationEmail
               ? `${t('registrationCodeHelp')} ${verificationEmail}.`
               : t('registrationIntro')
         }
         loading={isSubmitting}
         footer={
            verificationEmail ? (
               <button
                  type="button"
                  className="font-medium text-foreground underline"
                  onClick={() => {
                     setVerificationEmail(null);
                     setVerificationCode('');
                     setError(null);
                  }}
               >
                  {t('useOtherDetails')}
               </button>
            ) : (
               <>
                  {t('hasAccount')}{' '}
                  <Link href="/auth/login" className="font-medium text-foreground underline">
                     {t('signIn')}
                  </Link>
               </>
            )
         }
      >
         {verificationEmail ? (
            <form className="space-y-4" onSubmit={verifyCode}>
               <VStack gap={2}>
                  <Label htmlFor="verification-code">{t('verificationCode')}</Label>
                  <Input
                     id="verification-code"
                     value={verificationCode}
                     onChange={(event) =>
                        setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                     }
                     inputMode="numeric"
                     autoComplete="one-time-code"
                     pattern="[0-9]{6}"
                     placeholder="123456"
                     required
                     autoFocus
                  />
                  <Text type="supporting">{t('codeExpiry')}</Text>
               </VStack>
               {error && <Text role="alert">{error}</Text>}
               <Button
                  className="w-full"
                  type="submit"
                  disabled={isSubmitting || verificationCode.length !== 6}
               >
                  {isSubmitting ? t('verifying') : t('verifyAndCreate')}
               </Button>
            </form>
         ) : (
            <form className="space-y-4" onSubmit={onSubmit}>
               <VStack gap={2}>
                  <Label htmlFor="name">{t('name')}</Label>
                  <Input
                     id="name"
                     name="name"
                     autoComplete="name"
                     required
                     minLength={2}
                     maxLength={120}
                  />
               </VStack>
               <VStack gap={2}>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" name="email" type="email" autoComplete="email" required />
               </VStack>
               <VStack gap={2}>
                  <Label htmlFor="password">{t('password')}</Label>
                  <Input
                     id="password"
                     name="password"
                     type="password"
                     autoComplete="new-password"
                     required
                     minLength={12}
                  />
               </VStack>
               <VStack gap={2}>
                  <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
                  <Input
                     id="confirmPassword"
                     name="confirmPassword"
                     type="password"
                     autoComplete="new-password"
                     required
                     minLength={12}
                  />
               </VStack>
               {error && <Text role="alert">{error}</Text>}
               <Button className="w-full" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? t('sendingCode') : t('continue')}
               </Button>
            </form>
         )}
      </AuthCard>
   );
}
