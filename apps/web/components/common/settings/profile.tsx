'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Pencil } from 'lucide-react';
import { useEffect, useState } from 'react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

type Profile = {
   id: string;
   name: string;
   email: string;
   username: string | null;
   title: string | null;
   avatarUrl: string | null;
};

type EditableProfileField = 'name' | 'username' | 'title';
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Personal "Profile" settings. */
export default function Profile() {
   const [profile, setProfile] = useState<Profile>();
   const [draft, setDraft] = useState({ name: '', username: '', title: '' });
   const [error, setError] = useState<string>();
   const [saving, setSaving] = useState<EditableProfileField>();

   useEffect(() => {
      void fetch(`${api}/users/me`, { credentials: 'include' })
         .then((response) => (response.ok ? response.json() : Promise.reject()))
         .then((payload: { data: Profile }) => {
            setProfile(payload.data);
            setDraft({
               name: payload.data.name,
               username: payload.data.username ?? '',
               title: payload.data.title ?? '',
            });
         })
         .catch(() => setError('Could not load profile.'));
   }, []);

   const save = async (field: EditableProfileField) => {
      if (!profile || saving || draft[field] === (profile[field] ?? '')) return;
      if (field === 'name' && draft.name.trim().length < 2) {
         setError('Full name must contain at least two characters.');
         return;
      }
      setSaving(field);
      setError(undefined);
      try {
         const response = await fetch(`${api}/users/me`, {
            method: 'PATCH',
            credentials: 'include',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ [field]: draft[field] }),
         });
         const payload = (await response.json()) as { data?: Profile; message?: string | string[] };
         if (!response.ok || !payload.data) {
            throw new Error(
               Array.isArray(payload.message)
                  ? payload.message[0]
                  : (payload.message ?? 'Could not save profile.')
            );
         }
         setProfile(payload.data);
         setDraft({
            name: payload.data.name,
            username: payload.data.username ?? '',
            title: payload.data.title ?? '',
         });
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not save profile.');
      } finally {
         setSaving(undefined);
      }
   };

   if (!profile && !error) {
      return <p className="p-6 text-sm text-muted-foreground">Loading profile…</p>;
   }
   if (!profile) {
      return <p className="p-6 text-sm text-destructive">{error}</p>;
   }

   return (
      <SettingsShell title="Profile">
         <SettingsSection>
            <SettingsCard>
               <SettingsRow
                  title="Profile picture"
                  trailing={
                     <Avatar className="size-9">
                        <AvatarImage src={profile.avatarUrl ?? undefined} alt={profile.name} />
                        <AvatarFallback>{profile.name[0]}</AvatarFallback>
                     </Avatar>
                  }
               />
               <SettingsRow
                  title="Email"
                  trailing={
                     <span className="inline-flex items-center gap-2 text-foreground">
                        {profile.email}
                        <Button
                           size="icon"
                           variant="ghost"
                           className="size-6"
                           disabled
                           title="Email changes are not enabled yet."
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
                        value={draft.name}
                        className="h-8 w-44"
                        disabled={saving === 'name'}
                        onChange={(event) =>
                           setDraft((current) => ({ ...current, name: event.target.value }))
                        }
                        onBlur={() => void save('name')}
                     />
                  }
               />
               <SettingsRow
                  title="Title"
                  description="Your job title or role"
                  trailing={
                     <Input
                        value={draft.title}
                        placeholder="Software engineer"
                        className="h-8 w-44"
                        disabled={saving === 'title'}
                        onChange={(event) =>
                           setDraft((current) => ({ ...current, title: event.target.value }))
                        }
                        onBlur={() => void save('title')}
                     />
                  }
               />
               <SettingsRow
                  title="Username"
                  description="One word, like a nickname or first name"
                  trailing={
                     <Input
                        value={draft.username}
                        className="h-8 w-44"
                        disabled={saving === 'username'}
                        onChange={(event) =>
                           setDraft((current) => ({ ...current, username: event.target.value }))
                        }
                        onBlur={() => void save('username')}
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
                     <Button
                        size="xs"
                        variant="ghost"
                        className="text-red-500 hover:text-red-500"
                        disabled
                        title="Leaving a workspace is not enabled yet."
                     >
                        Leave workspace
                     </Button>
                  }
               />
            </SettingsCard>
         </SettingsSection>
         {error && <p className="text-sm text-destructive -mt-6">{error}</p>}
      </SettingsShell>
   );
}
