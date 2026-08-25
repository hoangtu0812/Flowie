'use client';

import { Button } from '@/components/ui/button';
import {
   AlertDialog,
   AlertDialogAction,
   AlertDialogCancel,
   AlertDialogContent,
   AlertDialogDescription,
   AlertDialogFooter,
   AlertDialogHeader,
   AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { KeyRound, Laptop, Smartphone } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
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

type RevokeTarget =
   { kind: 'others' } | { kind: 'session'; session: Session } | { kind: 'key'; key: ApiKey };

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
   const [revokeTarget, setRevokeTarget] = useState<RevokeTarget>();
   const [revoking, setRevoking] = useState(false);
   const [revokeError, setRevokeError] = useState<string>();
   const [createOpen, setCreateOpen] = useState(false);
   const [keyName, setKeyName] = useState('');
   const [keyExpiry, setKeyExpiry] = useState('');
   const [creatingKey, setCreatingKey] = useState(false);
   const [createError, setCreateError] = useState<string>();
   const [createdToken, setCreatedToken] = useState<string>();

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
      const response = await fetch(`${api}/auth/sessions`, {
         method: 'DELETE',
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not revoke sessions.');
      await load();
   };

   const revokeSession = async (session: Session) => {
      const response = await fetch(`${api}/auth/sessions/${session.id}`, {
         method: 'DELETE',
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not revoke this session.');
      await load();
   };

   const createKey = async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const name = keyName.trim();
      if (!name || creatingKey) return;
      setCreatingKey(true);
      setCreateError(undefined);
      const response = await fetch(`${api}/auth/api-keys`, {
         method: 'POST',
         credentials: 'include',
         headers: { 'content-type': 'application/json' },
         body: JSON.stringify({ name, ...(keyExpiry ? { expiresAt: keyExpiry } : {}) }),
      });
      const payload = (await response.json().catch(() => null)) as {
         data?: ApiKey & { token: string };
         message?: string | string[];
      } | null;
      if (!response.ok || !payload?.data) {
         setCreateError(
            Array.isArray(payload?.message)
               ? payload.message[0]
               : (payload?.message ?? 'Could not create API key.')
         );
         setCreatingKey(false);
         return;
      }
      setCreatedToken(payload.data.token);
      setCreatingKey(false);
      await load();
   };

   const revokeKey = async (key: ApiKey) => {
      const response = await fetch(`${api}/auth/api-keys/${key.id}`, {
         method: 'DELETE',
         credentials: 'include',
      });
      if (!response.ok) throw new Error('Could not revoke API key.');
      await load();
   };

   const confirmRevoke = async () => {
      if (!revokeTarget || revoking) return;
      setRevoking(true);
      setRevokeError(undefined);
      try {
         if (revokeTarget.kind === 'others') await revokeOthers();
         if (revokeTarget.kind === 'session') await revokeSession(revokeTarget.session);
         if (revokeTarget.kind === 'key') await revokeKey(revokeTarget.key);
         setRevokeTarget(undefined);
      } catch (caught) {
         setRevokeError(caught instanceof Error ? caught.message : 'Could not revoke access.');
      } finally {
         setRevoking(false);
      }
   };

   const closeCreate = () => {
      setCreateOpen(false);
      setKeyName('');
      setKeyExpiry('');
      setCreateError(undefined);
      setCreatedToken(undefined);
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
                        onClick={() => setRevokeTarget({ kind: 'others' })}
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
                           onClick={() => setRevokeTarget({ kind: 'session', session })}
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
                     <Button size="xs" variant="ghost" onClick={() => setCreateOpen(true)}>
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
                        <Button
                           size="xs"
                           variant="ghost"
                           onClick={() => setRevokeTarget({ kind: 'key', key })}
                        >
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
         <Dialog
            open={createOpen}
            onOpenChange={(open) => {
               if (!open && !creatingKey) closeCreate();
            }}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>{createdToken ? 'API key created' : 'New API key'}</DialogTitle>
                  <DialogDescription>
                     {createdToken
                        ? 'Copy this token now. It will not be shown again.'
                        : 'Create a personal token for API integrations.'}
                  </DialogDescription>
               </DialogHeader>
               {createdToken ? (
                  <div className="space-y-3">
                     <Input value={createdToken} readOnly aria-label="Personal API key" />
                     <DialogFooter>
                        <Button
                           variant="outline"
                           onClick={() =>
                              void navigator.clipboard
                                 .writeText(createdToken)
                                 .then(() => toast.success('API key copied.'))
                                 .catch(() => toast.error('Could not copy the API key.'))
                           }
                        >
                           Copy
                        </Button>
                        <Button onClick={closeCreate}>Done</Button>
                     </DialogFooter>
                  </div>
               ) : (
                  <form className="space-y-4" onSubmit={createKey}>
                     <div className="space-y-2">
                        <Label htmlFor="api-key-name">Name</Label>
                        <Input
                           id="api-key-name"
                           value={keyName}
                           onChange={(event) => setKeyName(event.target.value)}
                           maxLength={80}
                           autoFocus
                        />
                     </div>
                     <div className="space-y-2">
                        <Label htmlFor="api-key-expiry">Expiry date (optional)</Label>
                        <Input
                           id="api-key-expiry"
                           type="date"
                           value={keyExpiry}
                           onChange={(event) => setKeyExpiry(event.target.value)}
                        />
                     </div>
                     {createError && <p className="text-sm text-destructive">{createError}</p>}
                     <DialogFooter>
                        <Button type="button" variant="outline" onClick={closeCreate}>
                           Cancel
                        </Button>
                        <Button type="submit" disabled={creatingKey || !keyName.trim()}>
                           {creatingKey ? 'Creating…' : 'Create key'}
                        </Button>
                     </DialogFooter>
                  </form>
               )}
            </DialogContent>
         </Dialog>
         <AlertDialog
            open={Boolean(revokeTarget)}
            onOpenChange={(open) => {
               if (!open && !revoking) {
                  setRevokeTarget(undefined);
                  setRevokeError(undefined);
               }
            }}
         >
            <AlertDialogContent>
               <AlertDialogHeader>
                  <AlertDialogTitle>
                     {revokeTarget?.kind === 'others'
                        ? 'Revoke all other sessions?'
                        : revokeTarget?.kind === 'session'
                          ? `Revoke ${sessionName(revokeTarget.session.userAgent)}?`
                          : `Revoke API key “${revokeTarget?.key.name ?? ''}”?`}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                     This access will stop working immediately and cannot be restored.
                  </AlertDialogDescription>
               </AlertDialogHeader>
               {revokeError && <p className="text-sm text-destructive">{revokeError}</p>}
               <AlertDialogFooter>
                  <AlertDialogCancel disabled={revoking}>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                     disabled={revoking}
                     className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                     onClick={(event) => {
                        event.preventDefault();
                        void confirmRevoke();
                     }}
                  >
                     {revoking ? 'Revoking…' : 'Revoke'}
                  </AlertDialogAction>
               </AlertDialogFooter>
            </AlertDialogContent>
         </AlertDialog>
      </SettingsShell>
   );
}
