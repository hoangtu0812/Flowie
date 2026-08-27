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

type VerificationPayload = {
   data: { email: string; expiresAt: string };
};

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export default function RegisterPage() {
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
         if (!response.ok) {
            throw new Error((await responseError(response)) ?? 'Không thể gửi mã xác thực.');
         }
         const payload = (await response.json()) as VerificationPayload;
         setVerificationEmail(payload.data.email);
      } catch (caughtError) {
         setError(caughtError instanceof Error ? caughtError.message : 'Không thể tạo tài khoản.');
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
            throw new Error((await responseError(response)) ?? 'Không thể xác thực mã.');
         }
         const payload = (await response.json()) as AuthPayload;
         router.replace(
            payload.data.user.isPlatformAdmin
               ? '/admin'
               : `/${payload.data.workspace?.slug ?? 'flowie'}/teams`
         );
      } catch (caughtError) {
         setError(caughtError instanceof Error ? caughtError.message : 'Không thể xác thực mã.');
      } finally {
         setIsSubmitting(false);
      }
   }

   return (
      <AuthCard
         title={verificationEmail ? 'Xác thực đăng ký' : 'Tạo workspace mới'}
         description={
            verificationEmail
               ? `Nhập mã 6 chữ số do quản trị viên cung cấp từ kênh Discord Flowie Register cho ${verificationEmail}.`
               : 'Bắt đầu quản lý công việc cùng đội ngũ của bạn.'
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
                  Dùng thông tin đăng ký khác
               </button>
            ) : (
               <>
                  Đã có tài khoản?{' '}
                  <Link href="/auth/login" className="font-medium text-foreground underline">
                     Đăng nhập
                  </Link>
               </>
            )
         }
      >
         {verificationEmail ? (
            <form className="space-y-4" onSubmit={verifyCode}>
               <div className="space-y-2">
                  <Label htmlFor="verification-code">Mã xác thực</Label>
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
                  <p className="text-sm text-muted-foreground">Mã có hiệu lực trong 10 phút.</p>
               </div>
               {error && (
                  <p role="alert" className="text-sm text-destructive">
                     {error}
                  </p>
               )}
               <Button
                  className="w-full"
                  type="submit"
                  disabled={isSubmitting || verificationCode.length !== 6}
               >
                  {isSubmitting ? 'Đang xác thực…' : 'Xác thực và tạo tài khoản'}
               </Button>
            </form>
         ) : (
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
                  {isSubmitting ? 'Đang gửi mã xác thực…' : 'Tiếp tục'}
               </Button>
            </form>
         )}
      </AuthCard>
   );
}
