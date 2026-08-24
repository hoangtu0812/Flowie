'use client';

import { Button } from '@/components/ui/button';
import { KeyRound, Laptop, Smartphone } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type Session = {
   id: string;
   ipAddress: string | null;
   userAgent: string | null;
   expiresAt: string;
   createdAt: string;
   lastUsedAt: string;
   current: boolean;
};

type ApiKey = {
   id: string;
   name: string;
   prefix: string;
   expiresAt: string | null;
   lastUsedAt: string | null;
   createdAt: string;
};

const sessionName = (userAgent: string | null) => {
   if (!userAgent) return 'Unknown device';
   const browser = userAgent.includes('Edg/')
      ? 'Edge'
      : userAgent.includes('Firefox/')
        ? 'Firefox'
        : userAgent.includes('Chrome/')
          ? 'Chrome'
          : userAgent.includes('Safari/')
            ? 'Safari'
            : 'Browser';
   const platform = /iPhone|iPad|Android/i.test(userAgent)
      ? 'mobile'
      : userAgent.includes('Windows')
        ? 'Windows'
        : userAgent.includes('Mac OS')
          ? 'macOS'
          : userAgent.includes('Linux')
            ? 'Linux'
            : 'device';
   return `${browser} on ${platform}`;
};

const dateLabel = (value: string) => new Date(value).toLocaleString();

/** Original Security & access shell backed by real sessions and personal API keys. */
export default function AccountSecurity() {
   const [sessions, setSessions] = useState<Session[]>([]);
   const [keys, setKeys] = useState<ApiKey[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string>();

   const load = useCallback(async () => {
      setLoading(true);
      setError(undefined);
      try {
         const [sessionsResponse, keysResponse] = await Promise.all([
            fetch(`${api}/auth/sessions`, { credentials: 'include' }),
            fetch(`${api}/auth/api-keys`, { credentials: 'include' }),
         ]);
         if (!sessionsResponse.ok || !keysResponse.ok)
            throw new Error('Could not load security settings.');
         setSessions(((await sessionsResponse.json()) as { data: Session[] }).data);
         setKeys(((await keysResponse.json()) as { data: ApiKey[] }).data);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not load security settings.');
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => void load(), [load]);

   const revokeOthers = async () => {
      if (!window.confirm('Revoke every other signed-in session?')) return;
      const response = await fetch(`${api}/auth/sessions`, {
         method: 'DELETE',
         credentials: 'include',
      });
      if (!response.ok) return window.alert('Could not revoke sessions.');
      await load();
   };

   const revokeSession = async (session: Session) => {
      if (!window.confirm(`Revoke ${sessionName(session.userAgent)}?`)) return;
      const response = await fetch(`${api}/auth/sessions/${session.id}`, {
         method: 'DELETE',
         credentials: 'include',
      });
      if (!response.ok) return window.alert('Could not revoke this session.');
      await load();
   };

   const createKey = async () => {
      const name = window.prompt('API key name:')?.trim();
      if (!name) return;
      const expiresAt = window
         .prompt('Optional expiry date (YYYY-MM-DD). Leave empty for no expiry:', '')
         ?.trim();
      if (expiresAt === undefined) return;
      const response = await fetch(`${api}/auth/api-keys`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ name, ...(expiresAt ? { expiresAt } : {}) }),
      });
      const payload = (await response.json().catch(() => null)) as {
         data?: ApiKey & { token: string };
         message?: string;
      } | null;
      if (!response.ok || !payload?.data)
         return window.alert(payload?.message ?? 'Could not create API key.');
      window.alert(`Copy this API key now. It will not be shown again:\n\n${payload.data.token}`);
      await load();
   };

   const revokeKey = async (key: ApiKey) => {
      if (!window.confirm(`Revoke API key “${key.name}”?`)) return;
      const response = await fetch(`${api}/auth/api-keys/${key.id}`, {
         method: 'DELETE',
         credentials: 'include',
      });
      if (!response.ok) return window.alert('Could not revoke API key.');
      await load();
   };

   const current = sessions.find((session) => session.current);
   const others = sessions.filter((session) => !session.current);

   return (
      <SettingsShell title="Security & access">
         {loading && <p className="text-sm text-muted-foreground">Loading security settings…</p>}
         {error && <p className="text-sm text-destructive">{error}</p>}
         <SettingsSection title="Sessions" description="Devices logged into your account">
            <SettingsCard>
               {current ? (
                  <SettingsRow
                     icon={<Laptop className="size-4" />}
                     title={sessionName(current.userAgent)}
                     description={
                        <span className="inline-flex items-center gap-1.5">
                           <span className="size-1.5 rounded-full bg-[#00cc66]" />
                           <span className="text-[#00a05a]">Current session</span> ·{' '}
                           {current.ipAddress ?? 'Unknown IP'} · Last used{' '}
                           {dateLabel(current.lastUsedAt)}
                        </span>
                     }
                  />
               ) : (
                  !loading && (
                     <SettingsRow
                        title="Current session"
                        description="Session cookie unavailable"
                        muted
                     />
                  )
               )}
            </SettingsCard>
            <SettingsCard>
               <SettingsRow
                  title={`${others.length} other ${others.length === 1 ? 'session' : 'sessions'}`}
                  trailing={
                     <Button
                        size="xs"
                        variant="ghost"
                        disabled={others.length === 0}
                        onClick={() => void revokeOthers()}
                     >
                        Revoke all
                     </Button>
                  }
               />
               {others.map((session) => (
                  <SettingsRow
                     key={session.id}
                     icon={
                        /iPhone|iPad|Android/i.test(session.userAgent ?? '') ? (
                           <Smartphone className="size-4" />
                        ) : (
                           <Laptop className="size-4" />
                        )
                     }
                     title={sessionName(session.userAgent)}
                     description={`${session.ipAddress ?? 'Unknown IP'} · Last used ${dateLabel(session.lastUsedAt)}`}
                     trailing={
                        <Button
                           size="xs"
                           variant="ghost"
                           onClick={() => void revokeSession(session)}
                        >
                           Revoke
                        </Button>
                     }
                  />
               ))}
            </SettingsCard>
         </SettingsSection>
         <SettingsSection
            title="Passkeys"
            description="Passkeys are a secure way to sign in to your account"
         >
            <SettingsCard>
               <SettingsRow
                  title="No passkeys registered"
                  trailing={
                     <Button size="xs" variant="ghost" disabled>
                        Unavailable
                     </Button>
                  }
               />
            </SettingsCard>
         </SettingsSection>
         <SettingsSection
            title="Personal API keys"
            description="Use the REST API to build your own integrations"
         >
            <SettingsCard>
               <SettingsRow
                  title={`${keys.length} API ${keys.length === 1 ? 'key' : 'keys'}`}
                  trailing={
                     <Button size="xs" variant="ghost" onClick={() => void createKey()}>
                        New API key
                     </Button>
                  }
               />
               {keys.map((key) => (
                  <SettingsRow
                     key={key.id}
                     icon={<KeyRound className="size-4" />}
                     title={
                        <>
                           {key.name}
                           <span className="text-xs text-muted-foreground font-normal">
                              {' '}
                              · {key.prefix}…
                           </span>
                        </>
                     }
                     description={`Created ${dateLabel(key.createdAt)} · ${key.lastUsedAt ? `last used ${dateLabel(key.lastUsedAt)}` : 'never used'}`}
                     trailing={
                        <Button size="xs" variant="ghost" onClick={() => void revokeKey(key)}>
                           Revoke
                        </Button>
                     }
                  />
               ))}
            </SettingsCard>
         </SettingsSection>
         <SettingsSection
            title="Commit signing key"
            description="Signing keys are not enabled in this deployment"
         >
            <SettingsCard>
               <SettingsRow
                  title="No signing key added"
                  trailing={
                     <Button size="xs" variant="ghost" disabled>
                        Unavailable
                     </Button>
                  }
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
