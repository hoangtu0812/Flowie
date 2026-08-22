'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AuthCard } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AuthPayload = {
   data: { workspace: { slug: string } | null };
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function LoginPage() {
   const router = useRouter();
   const [error, setError] = useState<string | null>(null);
   const [isSubmitting, setIsSubmitting] = useState(false);

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
            }),
         });
         const payload = (await response.json()) as AuthPayload & { message?: string | string[] };
         if (!response.ok) {
            throw new Error(Array.isArray(payload.message) ? payload.message[0] : payload.message);
         }
         router.replace(`/${payload.data.workspace?.slug ?? 'flowie'}/team/CORE/all`);
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
         footer={
            <>
               Chưa có tài khoản?{' '}
               <Link href="/auth/register" className="font-medium text-foreground underline">
                  Tạo tài khoản
               </Link>
            </>
         }
      >
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
