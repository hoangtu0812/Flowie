'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { AuthCard } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AuthPayload = {
   data: { workspace: { slug: string } | null; user: { isPlatformAdmin: boolean } };
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function LoginPage() {
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
         setError(caughtError instanceof Error ? caughtError.message : 'Không thể đăng nhập.');
      } finally {
         setIsSubmitting(false);
      }
   }

   return (
      <AuthCard
         title="Chào mừng trở lại"
         description="Đăng nhập để tiếp tục với Flowie."
         loading={isSubmitting}
         footer={
            <>
               Chưa có tài khoản?{' '}
               <Link href="/auth/register" className="font-medium text-foreground underline">
                  Tạo tài khoản
               </Link>
            </>
         }
      >
         {microsoftEnabled && (
            <>
               <Button variant="outline" className="w-full" asChild>
                  <a href={microsoftHref}>
                     <span aria-hidden="true" className="grid size-4 grid-cols-2 gap-0.5">
                        <span className="bg-[#f25022]" />
                        <span className="bg-[#7fba00]" />
                        <span className="bg-[#00a4ef]" />
                        <span className="bg-[#ffb900]" />
                     </span>
                     Đăng nhập với Microsoft
                  </a>
               </Button>
               <div className="flex items-center gap-3" aria-hidden="true">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                     hoặc
                  </span>
                  <span className="h-px flex-1 bg-border" />
               </div>
            </>
         )}
         <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
               <Label htmlFor="email">Email</Label>
               <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
               <Label htmlFor="password">Mật khẩu</Label>
               <Input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
               />
            </div>
            {error && (
               <p role="alert" className="text-sm text-destructive">
                  {error}
               </p>
            )}
            <Button className="w-full" type="submit" disabled={isSubmitting}>
               {isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
            </Button>
         </form>
      </AuthCard>
   );
}
