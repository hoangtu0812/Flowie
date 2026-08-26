'use client';

import { authenticatedFetch } from '@/lib/workspaces';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { KeyRound, Laptop, Smartphone } from 'lucide-react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type AccountSession = {
   id: string;
   ipAddress: string | null;
   userAgent: string | null;
   expiresAt: string;
   createdAt: string;
   lastUsedAt: string;
   current: boolean;
};

function deviceName(userAgent: string | null) {
   const value = userAgent ?? '';
   const browser = value.includes('Edg/')
      ? 'Edge'
      : value.includes('Firefox/')
        ? 'Firefox'
        : value.includes('Chrome/')
          ? 'Chrome'
          : value.includes('Safari/')
            ? 'Safari'
            : 'Browser';
   const device = /iPhone|iPad|iPod/i.test(value)
      ? 'iOS'
      : /Android/i.test(value)
        ? 'Android'
        : /Windows/i.test(value)
          ? 'Windows'
          : /Mac OS|Macintosh/i.test(value)
            ? 'macOS'
            : /Linux/i.test(value)
              ? 'Linux'
              : 'device';
   return `${browser} on ${device}`;
}

function sessionIcon(userAgent: string | null) {
   return /iPhone|iPad|iPod|Android/i.test(userAgent ?? '') ? Smartphone : Laptop;
}

function relativeTime(value: string) {
   const milliseconds = Date.now() - new Date(value).getTime();
   const minutes = Math.max(0, Math.floor(milliseconds / 60_000));
   if (minutes < 1) return 'just now';
   if (minutes < 60) return `${minutes}m ago`;
   const hours = Math.floor(minutes / 60);
   if (hours < 24) return `${hours}h ago`;
   return `${Math.floor(hours / 24)}d ago`;
}

/** Persisted device sessions are live; future security features remain visible but locked. */
export default function AccountSecurity() {
   const [sessions, setSessions] = useState<AccountSession[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string>();
   const [revoking, setRevoking] = useState(false);

   const loadSessions = useCallback(async () => {
      setLoading(true);
      setError(undefined);
      try {
         const response = await authenticatedFetch(`${api}/auth/sessions`);
         if (!response.ok) throw new Error('Could not load active sessions.');
         setSessions(((await response.json()) as { data: AccountSession[] }).data);
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not load active sessions.');
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      void loadSessions();
   }, [loadSessions]);

   const currentSession = useMemo(() => sessions.find((session) => session.current), [sessions]);
   const otherSessions = useMemo(() => sessions.filter((session) => !session.current), [sessions]);

   const revokeOthers = async () => {
      setRevoking(true);
      setError(undefined);
      try {
         const response = await authenticatedFetch(`${api}/auth/sessions`, { method: 'DELETE' });
         if (!response.ok) throw new Error('Could not revoke other sessions.');
         await loadSessions();
      } catch (caught) {
         setError(caught instanceof Error ? caught.message : 'Could not revoke other sessions.');
      } finally {
         setRevoking(false);
      }
   };

   return (
      <SettingsShell title="Security & access">
         <SettingsSection
            title="Sessions"
            description="Devices currently signed in to your account"
         >
            {loading && <p className="py-3 text-sm text-muted-foreground">Loading sessions…</p>}
            {!loading && error && <p className="py-3 text-sm text-destructive">{error}</p>}
            {!loading && !error && !currentSession && (
               <p className="py-3 text-sm text-muted-foreground">No active sessions found.</p>
            )}
            {!loading &&
               !error &&
               currentSession &&
               (() => {
                  const Icon = sessionIcon(currentSession.userAgent);
                  return (
                     <SettingsCard>
                        <SettingsRow
                           icon={<Icon className="size-4" />}
                           title={deviceName(currentSession.userAgent)}
                           description={
                              <span className="inline-flex items-center gap-1.5">
                                 <span className="size-1.5 rounded-full bg-[#00cc66]" />
                                 <span className="text-[#00a05a]">Current session</span>
                                 {currentSession.ipAddress && <>· {currentSession.ipAddress}</>}
                                 <span>
                                    · Last active {relativeTime(currentSession.lastUsedAt)}
                                 </span>
                              </span>
                           }
                        />
                     </SettingsCard>
                  );
               })()}
            {!loading && !error && otherSessions.length > 0 && (
               <SettingsCard>
                  <SettingsRow
                     title={`${otherSessions.length} other ${otherSessions.length === 1 ? 'session' : 'sessions'}`}
                     trailing={
                        <Button
                           size="xs"
                           variant="ghost"
                           onClick={() => void revokeOthers()}
                           disabled={revoking}
                        >
                           {revoking ? 'Revoking…' : 'Revoke all'}
                        </Button>
                     }
                  />
                  {otherSessions.map((session) => {
                     const Icon = sessionIcon(session.userAgent);
                     return (
                        <SettingsRow
                           key={session.id}
                           icon={<Icon className="size-4" />}
                           title={deviceName(session.userAgent)}
                           description={`${session.ipAddress ? `${session.ipAddress} · ` : ''}Last active ${relativeTime(session.lastUsedAt)}`}
                        />
                     );
                  })}
               </SettingsCard>
            )}
         </SettingsSection>

         <SettingsSection title="Passkeys" description="Passkeys are not available in Flowie yet.">
            <SettingsCard>
               <SettingsRow
                  title="No passkeys registered"
                  trailing={
                     <Button size="xs" variant="ghost" disabled>
                        New passkey
                     </Button>
                  }
                  disabled
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Personal API keys"
            description="API key management is not available in Flowie yet."
         >
            <SettingsCard>
               <SettingsRow
                  title="No API keys configured"
                  trailing={
                     <Button size="xs" variant="ghost" disabled>
                        New API key
                     </Button>
                  }
                  disabled
               />
               <SettingsRow
                  icon={<KeyRound className="size-4" />}
                  title="API key management is unavailable"
                  description="Personal API keys will be added in a later release."
                  disabled
               />
            </SettingsCard>
         </SettingsSection>

         <SettingsSection
            title="Commit signing key"
            description="Commit signing is not available in Flowie yet."
         >
            <SettingsCard>
               <SettingsRow
                  title="No signing key added"
                  trailing={
                     <Button size="xs" variant="ghost" disabled>
                        Add key
                     </Button>
                  }
                  disabled
               />
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
