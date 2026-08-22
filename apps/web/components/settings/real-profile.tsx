'use client';

import { FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Profile = { name: string; email: string; username: string | null; avatarUrl: string | null };
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export function RealProfile() {
   const [profile, setProfile] = useState<Profile>();
   const [error, setError] = useState<string>();
   const [saved, setSaved] = useState(false);
   const [saving, setSaving] = useState(false);

   useEffect(() => {
      void fetch(`${api}/users/me`, { credentials: 'include' })
         .then((response) => (response.ok ? response.json() : Promise.reject()))
         .then((payload: { data: Profile }) => setProfile(payload.data))
         .catch(() => setError('Không thể tải hồ sơ.'));
   }, []);

   async function submit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      const data = new FormData(event.currentTarget);
      setSaving(true);
      setSaved(false);
      setError(undefined);
      try {
         const response = await fetch(`${api}/users/me`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               name: data.get('name'),
               username: data.get('username'),
               avatarUrl: data.get('avatarUrl'),
            }),
         });
         const payload = (await response.json()) as { data?: Profile; message?: string | string[] };
         if (!response.ok || !payload.data)
            throw new Error(
               Array.isArray(payload.message)
                  ? payload.message[0]
                  : (payload.message ?? 'Không thể lưu hồ sơ.')
            );
         setProfile(payload.data);
         setSaved(true);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Không thể lưu hồ sơ.');
      } finally {
         setSaving(false);
      }
   }

   if (!profile && !error)
      return <p className="p-6 text-sm text-muted-foreground">Đang tải hồ sơ…</p>;
   if (!profile) return <p className="p-6 text-sm text-destructive">{error}</p>;
   return (
      <section className="mx-auto w-full max-w-2xl p-6">
         <h1 className="text-xl font-semibold">Hồ sơ cá nhân</h1>
         <p className="mt-1 text-sm text-muted-foreground">
            Cập nhật thông tin hiển thị trong workspace.
         </p>
         <form className="mt-6 space-y-4 rounded-lg border bg-card p-5" onSubmit={submit}>
            <div>
               <Label htmlFor="profile-name">Tên hiển thị</Label>
               <Input
                  className="mt-1"
                  id="profile-name"
                  name="name"
                  defaultValue={profile.name}
                  minLength={2}
                  maxLength={120}
                  required
               />
            </div>
            <div>
               <Label htmlFor="profile-email">Email</Label>
               <Input className="mt-1" id="profile-email" value={profile.email} disabled />
            </div>
            <div>
               <Label htmlFor="profile-username">Tên người dùng</Label>
               <Input
                  className="mt-1"
                  id="profile-username"
                  name="username"
                  defaultValue={profile.username ?? ''}
                  minLength={2}
                  maxLength={48}
                  placeholder="hoang-tu"
               />
            </div>
            <div>
               <Label htmlFor="profile-avatar">URL ảnh đại diện</Label>
               <Input
                  className="mt-1"
                  id="profile-avatar"
                  name="avatarUrl"
                  type="url"
                  defaultValue={profile.avatarUrl ?? ''}
                  placeholder="https://…"
               />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {saved && <p className="text-sm text-emerald-600">Đã lưu hồ sơ.</p>}
            <Button type="submit" disabled={saving}>
               {saving ? 'Đang lưu…' : 'Lưu thay đổi'}
            </Button>
         </form>
      </section>
   );
}
