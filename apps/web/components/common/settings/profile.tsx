'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authenticatedFetch } from '@/lib/workspaces';
import { Pencil } from 'lucide-react';
import { ChangeEvent, KeyboardEvent, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type ProfileData = {
   id: string;
   name: string;
   email: string;
   username: string | null;
   title: string | null;
   avatarUrl: string | null;
};

function avatarColor(name: string) {
   const colors = ['#5b5bd6', '#0f9d7a', '#d05b45', '#9a5ec4', '#1976b9', '#b86e16'];
   const hash = Array.from(name || '?').reduce(
      (total, character) => (total * 31 + character.charCodeAt(0)) >>> 0,
      7
   );
   return colors[hash % colors.length];
}

function avatarSource(value: string | null | undefined) {
   if (!value) return undefined;
   return value.startsWith('/') ? `${api}${value}` : value;
}

function responseMessage(payload: unknown, fallback: string) {
   if (!payload || typeof payload !== 'object' || !('message' in payload)) return fallback;
   const message = (payload as { message?: string | string[] }).message;
   return Array.isArray(message) ? message[0] : message || fallback;
}

/** Personal "Profile" settings backed by the native Python user profile API. */
export default function Profile() {
   const [profile, setProfile] = useState<ProfileData | null>(null);
   const [saving, setSaving] = useState(false);
   const avatarInput = useRef<HTMLInputElement>(null);

   useEffect(() => {
      let active = true;
      authenticatedFetch(`${api}/users/me`)
         .then(async (response) => {
            if (!response.ok) throw new Error('Could not load your profile.');
            return (await response.json()) as { data: ProfileData };
         })
         .then((payload) => active && setProfile(payload.data))
         .catch((error: Error) => active && toast.error(error.message));
      return () => {
         active = false;
      };
   }, []);

   const save = async (field: 'name' | 'title' | 'username') => {
      if (!profile || saving) return;
      const value = profile[field]?.trim() ?? '';
      if (field === 'name' && value.length < 2) {
         toast.error('Full name must contain at least 2 characters.');
         return;
      }
      setSaving(true);
      try {
         const response = await authenticatedFetch(`${api}/users/me`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ [field]: value || null }),
         });
         const payload = (await response.json().catch(() => null)) as {
            data?: ProfileData;
            message?: string | string[];
         } | null;
         if (!response.ok || !payload?.data)
            throw new Error(responseMessage(payload, 'Could not update profile.'));
         setProfile(payload.data);
         toast.success('Profile updated');
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not update profile.');
      } finally {
         setSaving(false);
      }
   };

   const submitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === 'Enter') event.currentTarget.blur();
   };

   const uploadAvatar = async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (!file) return;
      const formData = new FormData();
      formData.append('file', file);
      try {
         const response = await authenticatedFetch(`${api}/users/me/avatar`, {
            method: 'POST',
            body: formData,
         });
         const payload = (await response.json().catch(() => null)) as {
            data?: ProfileData;
            message?: string | string[];
         } | null;
         if (!response.ok || !payload?.data)
            throw new Error(responseMessage(payload, 'Could not upload profile picture.'));
         setProfile(payload.data);
         toast.success('Profile picture updated');
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not upload profile picture.');
      }
   };

   const name = profile?.name ?? '';
   const avatar = avatarSource(profile?.avatarUrl);

   return (
      <SettingsShell title="Profile">
         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title="Profile picture"
                  trailing={
                     <>
                        <Input
                           ref={avatarInput}
                           type="file"
                           accept="image/jpeg,image/png,image/gif,image/webp"
                           className="hidden"
                           onChange={uploadAvatar}
                        />
                        <button
                           type="button"
                           onClick={() => avatarInput.current?.click()}
                           className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                           aria-label="Upload profile picture"
                           title="Upload profile picture"
                        >
                           <Avatar className="size-9">
                              <AvatarImage src={avatar} alt={name} />
                              <AvatarFallback
                                 className="text-sm font-medium text-white"
                                 style={{ backgroundColor: avatarColor(name) }}
                              >
                                 {name.trim().charAt(0).toUpperCase() || '?'}
                              </AvatarFallback>
                           </Avatar>
                        </button>
                     </>
                  }
               />
               <SettingsRow
                  title="Email"
                  trailing={
                     <span className="inline-flex items-center gap-2 text-foreground">
                        {profile?.email ?? ''}
                        <Button
                           size="icon"
                           variant="ghost"
                           className="size-6"
                           disabled
                           aria-label="Email address"
                        >
                           <Pencil className="size-3" />
                        </Button>
                     </span>
                  }
               />
               <SettingsRow
                  title="Full name"
                  trailing={
                     <Input
                        value={name}
                        disabled={!profile || saving}
                        onChange={(event) =>
                           setProfile((current) =>
                              current ? { ...current, name: event.target.value } : current
                           )
                        }
                        onBlur={() => save('name')}
                        onKeyDown={submitOnEnter}
                        className="h-8 w-44"
                     />
                  }
               />
               <SettingsRow
                  title="Title"
                  description="Your job title or role"
                  trailing={
                     <Input
                        value={profile?.title ?? ''}
                        disabled={!profile || saving}
                        placeholder="Software engineer"
                        onChange={(event) =>
                           setProfile((current) =>
                              current ? { ...current, title: event.target.value } : current
                           )
                        }
                        onBlur={() => save('title')}
                        onKeyDown={submitOnEnter}
                        className="h-8 w-44"
                     />
                  }
               />
               <SettingsRow
                  title="Username"
                  description="One word, like a nickname or first name"
                  trailing={
                     <Input
                        value={profile?.username ?? ''}
                        disabled={!profile || saving}
                        onChange={(event) =>
                           setProfile((current) =>
                              current ? { ...current, username: event.target.value } : current
                           )
                        }
                        onBlur={() => save('username')}
                        onKeyDown={submitOnEnter}
                        className="h-8 w-44"
                     />
                  }
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection title="Workspace access">
            <SettingsCard>
               <SettingsRow
                  title="Remove yourself from workspace"
                  trailing={
                     <Button size="xs" variant="ghost" className="text-red-500 hover:text-red-500">
                        Leave workspace
                     </Button>
                  }
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
