'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { useLocale } from '@/features/shared/use-locale';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { AuthCard } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AuthPayload = {
   data: { workspace: { slug: string } | null; user: { isPlatformAdmin: boolean } };
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function LoginPage() {
   const { t } = useLocale();
   const router = useRouter();
   const searchParams = useSearchParams();
   const [error, setError] = useState<string | null>(null);
   const [isSubmitting, setIsSubmitting] = useState(false);
   const [microsoftEnabled, setMicrosoftEnabled] = useState(false);
   const [timezone, setTimezone] = useState('UTC');

   useEffect(() => {
      setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
      const microsoftError = searchParams.get('azure_error');
      if (microsoftError) setError(microsoftError);
      void fetch(`${apiUrl}/auth/providers`)
         .then(async (response) => {
            if (!response.ok) return;
            const payload = (await response.json()) as {
               data?: { microsoft?: { enabled?: boolean } };
            };
            setMicrosoftEnabled(Boolean(payload.data?.microsoft?.enabled));
         })
         .catch(() => undefined);
   }, [searchParams]);

   const microsoftHref = useMemo(() => {
      const parameters = new URLSearchParams({
         timezone,
      });
      const next = searchParams.get('next');
      if (next) parameters.set('next', next);
      return `${apiUrl}/auth/microsoft/start?${parameters.toString()}`;
   }, [searchParams, timezone]);

   async function onSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      setError(null);
      setIsSubmitting(true);
      try {
         const response = await fetch(`${apiUrl}/auth/login`, {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
               email: formData.get('email'),
               password: formData.get('password'),
               timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }),
         });
         const payload = (await response.json()) as AuthPayload & { message?: string | string[] };
         if (!response.ok) {
            throw new Error(Array.isArray(payload.message) ? payload.message[0] : payload.message);
         }
         const next = searchParams.get('next');
         const safeNext = next?.startsWith('/') && !next.startsWith('//') ? next : null;
         router.replace(
            safeNext ??
               (payload.data.workspace
                  ? `/${payload.data.workspace.slug}/teams`
                  : payload.data.user.isPlatformAdmin
                    ? '/admin'
                    : '/invitations')
         );
      } catch (caughtError) {
         setError(caughtError instanceof Error ? caughtError.message : t('signInFailed'));
      } finally {
         setIsSubmitting(false);
      }
   }

   return (
      <AuthCard
         title={t('welcome')}
         description={t('signInDescription')}
         loading={isSubmitting}
         footer={
            <>
               {t('noAccount')}{' '}
               <Link href="/auth/register" className="font-medium text-foreground underline">
                  {t('createAccount')}
               </Link>
            </>
         }
      >
         {microsoftEnabled && (
            <>
               <Button variant="outline" className="w-full" asChild>
                  <a href={microsoftHref}>{t('microsoft')}</a>
               </Button>
               <Text>{t('or')}</Text>
            </>
         )}
         <form className="space-y-4" onSubmit={onSubmit}>
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
                  autoComplete="current-password"
                  required
               />
            </VStack>
            {error && <Text role="alert">{error}</Text>}
            <Button className="w-full" type="submit" disabled={isSubmitting}>
               {isSubmitting ? t('signingIn') : t('signIn')}
            </Button>
            <Link href="/auth/forgot-password" className="text-sm underline">
               {t('forgotPassword')}
            </Link>
         </form>
      </AuthCard>
   );
}
