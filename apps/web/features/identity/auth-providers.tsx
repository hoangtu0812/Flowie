'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Text } from '@astryxdesign/core/Text';
import { AuthCard } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/features/shared/use-locale';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export function useAuthProviders() {
   const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
   const [microsoftEnabled, setMicrosoftEnabled] = useState(false);
   const [attempt, setAttempt] = useState(0);
   const retry = useCallback(() => setAttempt((value) => value + 1), []);
   useEffect(() => {
      const controller = new AbortController();
      setState('loading');
      void fetch(`${api}/auth/providers`, { signal: controller.signal, cache: 'no-store' })
         .then(async (response) => {
            if (!response.ok) throw new Error('Provider configuration unavailable');
            const payload = await response.json();
            const enabled = payload.data?.microsoft?.enabled;
            if (typeof enabled !== 'boolean') throw new Error('Invalid provider configuration');
            if (!controller.signal.aborted) {
               setMicrosoftEnabled(enabled);
               setState('ready');
            }
         })
         .catch(() => {
            if (!controller.signal.aborted) setState('error');
         });
      return () => controller.abort();
   }, [attempt]);
   return {
      state,
      microsoftEnabled,
      passwordEnabled: state === 'ready' && !microsoftEnabled,
      retry,
   };
}

export function AuthProviderStatus({
   state,
   retry,
}: Pick<ReturnType<typeof useAuthProviders>, 'state' | 'retry'>) {
   const { t } = useLocale();
   if (state === 'loading') return <Text role="status">{t('loadingSignInOptions')}</Text>;
   if (state === 'error')
      return (
         <>
            <Text role="alert">{t('signInOptionsUnavailable')}</Text>
            <Button type="button" variant="outline" onClick={retry}>
               {t('retrySignInOptions')}
            </Button>
         </>
      );
   return null;
}

export function PasswordAuthBoundary({ children }: { children: ReactNode }) {
   const providers = useAuthProviders();
   const { t } = useLocale();
   if (providers.passwordEnabled) return children;
   return (
      <AuthCard title={t('welcome')} description={t('signInDescription')} footer={null}>
         <AuthProviderStatus {...providers} />
         {providers.state === 'ready' && (
            <>
               <Text>{t('microsoftOnly')}</Text>
               <Button asChild>
                  <Link href="/auth/login">{t('microsoft')}</Link>
               </Button>
            </>
         )}
      </AuthCard>
   );
}
