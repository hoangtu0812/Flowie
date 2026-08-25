'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

import { AuthCard } from '@/components/auth/auth-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AuthPayload = {
   data: { workspace: { slug: string } | null; user: { isPlatformAdmin: boolean } };
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function RegisterPage() {
   const router = useRouter();
   const [error, setError] = useState<string | null>(null);
   const [isSubmitting, setIsSubmitting] = useState(false);

   async function onSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      const formData = new FormData(event.currentTarget);
      const password = String(formData.get('password') ?? '');
      const confirmPassword = String(formData.get('confirmPassword') ?? '');
      if (password !== confirmPassword) {
         setError('Mật khẩu xác nhận chưa khớp.');
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
         const payload = (await response.json()) as AuthPayload & { message?: string | string[] };
         if (!response.ok) {
            throw new Error(Array.isArray(payload.message) ? payload.message[0] : payload.message);
         }
         router.replace(
            payload.data.user.isPlatformAdmin
               ? '/admin'
               : `/${payload.data.workspace?.slug ?? 'flowie'}/teams`
         );
      } catch (caughtError) {
         setError(caughtError instanceof Error ? caughtError.message : 'Không thể tạo tài khoản.');
      } finally {
         setIsSubmitting(false);
      }
   }

   return (
      <AuthCard
         title="Tạo workspace mới"
         description="Bắt đầu quản lý công việc cùng đội ngũ của bạn."
         footer={
            <>
               Đã có tài khoản?{' '}
               <Link href="/auth/login" className="font-medium text-foreground underline">
                  Đăng nhập
               </Link>
            </>
         }
      >
         <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
               <Label htmlFor="name">Họ và tên</Label>
               <Input
                  id="name"
                  name="name"
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={120}
               />
            </div>
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
                  autoComplete="new-password"
                  required
                  minLength={12}
               />
            </div>
            <div className="space-y-2">
               <Label htmlFor="confirmPassword">Xác nhận mật khẩu</Label>
               <Input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={12}
               />
            </div>
            {error && (
               <p role="alert" className="text-sm text-destructive">
                  {error}
               </p>
            )}
            <Button className="w-full" type="submit" disabled={isSubmitting}>
               {isSubmitting ? 'Đang tạo workspace…' : 'Tạo tài khoản'}
            </Button>
         </form>
      </AuthCard>
   );
}
