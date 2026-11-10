'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogHeader,
   DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { responseData } from '@/lib/http';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export const TEAMS_WEBHOOK_PLACEHOLDER = 'https://….logic.azure.com/workflows/…';

export type TeamsStatus = {
   enabled: boolean;
   webhookUrlMasked: string;
   updatedAt: string;
   channelName?: string | null;
} | null;

/** Teams delivery is offered only while Microsoft Entra sign-in is configured. */
export async function microsoftSignInEnabled(): Promise<boolean> {
   try {
      const response = await fetch(`${api}/auth/providers`);
      const payload = (await response.json()) as { data?: { microsoft?: { enabled?: boolean } } };
      return Boolean(payload.data?.microsoft?.enabled);
   } catch {
      return false;
   }
}

export async function loadTeamsStatus(): Promise<TeamsStatus> {
   const workspaceId = (await loadCurrentWorkspace()).id;
   const response = await authenticatedFetch(
      `${api}/integrations/teams?workspaceId=${workspaceId}`
   );
   if (!response.ok) throw new Error('Could not load the Microsoft Teams integration.');
   return ((await response.json()) as { data: TeamsStatus }).data;
}

async function testTeamsDelivery(path: string): Promise<string> {
   const response = await authenticatedFetch(`${api}/integrations/teams${path}`, {
      method: 'POST',
   });
   const payload = (await response.json().catch(() => null)) as {
      data?: { delivered: boolean; reason?: string };
   } | null;
   if (response.ok && payload?.data?.delivered) return 'Test message sent to Microsoft Teams.';
   throw new Error(
      payload?.data?.reason ??
         'The test could not be delivered. Check the webhook and enabled state.'
   );
}

/** Reports a request's progress and outcome in a toast; resolves to undefined on failure. */
export function withTeamsToast<T>(
   request: Promise<T>,
   loading: string,
   success: string | ((value: T) => string)
): Promise<T | undefined> {
   toast.promise(request, {
      loading,
      success,
      error: (error: unknown) =>
         error instanceof Error ? error.message : 'Microsoft Teams could not be reached.',
   });
   return request.catch(() => undefined);
}

export function Pending() {
   return <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />;
}

/** Sends a test card; progress and the outcome are reported through a toast. */
export function TeamsTestButton({ path, disabled }: { path: string; disabled?: boolean }) {
   const [sending, setSending] = useState(false);

   async function send() {
      setSending(true);
      await withTeamsToast(
         testTeamsDelivery(path),
         'Sending test message to Microsoft Teams…',
         (message) => message
      );
      setSending(false);
   }

   return (
      <Button
         type="button"
         variant="outline"
         onClick={() => void send()}
         disabled={disabled || sending}
      >
         {sending && <Pending />}
         {sending ? 'Sending…' : 'Send test'}
      </Button>
   );
}

export function TeamsIntegration({
   onSaved,
}: {
   onSaved?: (status: NonNullable<TeamsStatus>) => void;
}) {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [url, setUrl] = useState('');
   const [enabled, setEnabled] = useState(true);
   const [message, setMessage] = useState<string>();
   const [saving, setSaving] = useState(false);
   const [configured, setConfigured] = useState(false);

   useEffect(() => {
      void loadCurrentWorkspace()
         .then(async (workspace) => {
            setWorkspaceId(workspace.id);
            const status = await loadTeamsStatus();
            if (status) {
               setConfigured(true);
               setEnabled(status.enabled);
            }
         })
         .catch(() => setMessage('Could not load the Microsoft Teams integration.'));
   }, []);

   async function save(event: FormEvent) {
      event.preventDefault();
      if (!workspaceId) return;
      setSaving(true);
      setMessage(undefined);
      const status = await withTeamsToast(
         authenticatedFetch(`${api}/integrations/teams?workspaceId=${workspaceId}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...(url ? { webhookUrl: url } : {}), enabled }),
         }).then((response) =>
            responseData<NonNullable<TeamsStatus>>(
               response,
               'Could not save the Microsoft Teams integration.'
            )
         ),
         'Saving Microsoft Teams integration…',
         'Microsoft Teams integration saved.'
      );
      setSaving(false);
      if (!status) return;
      setConfigured(true);
      setUrl('');
      setEnabled(status.enabled);
      onSaved?.(status);
   }

   return (
      <form className="space-y-5" onSubmit={save}>
         <div>
            <Label htmlFor="teams-url">Teams Workflows webhook URL</Label>
            <Input
               id="teams-url"
               className="mt-1"
               value={url}
               onChange={(event) => setUrl(event.target.value)}
               placeholder={
                  configured
                     ? 'Configured — enter a new URL to replace it'
                     : TEAMS_WEBHOOK_PLACEHOLDER
               }
               type="url"
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
               In the Teams channel, add the workflow “Post to a channel when a webhook request is
               received” and paste its URL here.
            </p>
         </div>
         <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
            <div>
               <p className="text-sm font-medium">Enable Microsoft Teams notifications</p>
               <p className="text-xs text-muted-foreground">
                  Deliver supported workspace events to this channel.
               </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
         </div>
         {message && <p className="text-sm text-muted-foreground">{message}</p>}
         <div className="flex gap-2">
            <Button type="submit" disabled={saving || (!configured && !url)}>
               {saving && <Pending />}
               {saving ? 'Saving…' : 'Save configuration'}
            </Button>
            <TeamsTestButton
               path={`/test?workspaceId=${workspaceId}`}
               disabled={!configured || !workspaceId}
            />
         </div>
      </form>
   );
}

export function TeamsIntegrationDialog({
   open,
   onOpenChange,
   onSaved,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   onSaved?: (status: NonNullable<TeamsStatus>) => void;
}) {
   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="sm:max-w-lg">
            <DialogHeader>
               <DialogTitle>Microsoft Teams</DialogTitle>
               <DialogDescription>
                  Configure the Teams channel used for Flowie workspace notifications.
               </DialogDescription>
            </DialogHeader>
            <TeamsIntegration onSaved={onSaved} />
         </DialogContent>
      </Dialog>
   );
}
