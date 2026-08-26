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
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type DiscordStatus = {
   enabled: boolean;
   webhookUrlMasked: string;
   updatedAt: string;
} | null;

export async function loadDiscordStatus(): Promise<DiscordStatus> {
   const workspaceId = (await loadCurrentWorkspace()).id;
   const response = await authenticatedFetch(
      `${api}/integrations/discord?workspaceId=${workspaceId}`
   );
   if (!response.ok) throw new Error('Could not load the Discord integration.');
   return ((await response.json()) as { data: DiscordStatus }).data;
}

export function DiscordIntegration({
   onSaved,
}: {
   onSaved?: (status: NonNullable<DiscordStatus>) => void;
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
            const status = await loadDiscordStatus();
            if (status) {
               setConfigured(true);
               setEnabled(status.enabled);
            }
         })
         .catch(() => setMessage('Could not load the Discord integration.'));
   }, []);

   async function save(event: FormEvent) {
      event.preventDefault();
      if (!workspaceId) return;
      setSaving(true);
      setMessage(undefined);
      const response = await authenticatedFetch(
         `${api}/integrations/discord?workspaceId=${workspaceId}`,
         {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...(url ? { webhookUrl: url } : {}), enabled }),
         }
      );
      setSaving(false);
      if (!response.ok) {
         setMessage('Could not save. Check the webhook URL and your workspace role.');
         return;
      }
      const status = ((await response.json()) as { data: NonNullable<DiscordStatus> }).data;
      setConfigured(true);
      setUrl('');
      setEnabled(status.enabled);
      setMessage('Discord integration saved.');
      onSaved?.(status);
   }

   async function test() {
      if (!workspaceId) return;
      const response = await authenticatedFetch(
         `${api}/integrations/discord/test?workspaceId=${workspaceId}`,
         {
            method: 'POST',
         }
      );
      const payload = (await response.json().catch(() => null)) as {
         data?: { delivered: boolean; reason?: string };
      } | null;
      if (response.ok && payload?.data?.delivered) {
         setMessage('Test notification queued for Discord.');
         return;
      }
      setMessage(
         payload?.data?.reason ??
            'The test could not be delivered. Check the webhook and enabled state.'
      );
   }

   return (
      <form className="space-y-5" onSubmit={save}>
         <div>
            <Label htmlFor="discord-url">Discord webhook URL</Label>
            <Input
               id="discord-url"
               className="mt-1"
               value={url}
               onChange={(event) => setUrl(event.target.value)}
               placeholder={
                  configured
                     ? 'Configured — enter a new URL to replace it'
                     : 'https://discord.com/api/webhooks/…'
               }
               type="url"
            />
         </div>
         <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
            <div>
               <p className="text-sm font-medium">Enable Discord notifications</p>
               <p className="text-xs text-muted-foreground">
                  Deliver supported workspace events through the configured webhook.
               </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
         </div>
         {message && <p className="text-sm text-muted-foreground">{message}</p>}
         <div className="flex gap-2">
            <Button type="submit" disabled={saving || (!configured && !url)}>
               {saving ? 'Saving…' : 'Save configuration'}
            </Button>
            <Button
               type="button"
               variant="outline"
               onClick={() => void test()}
               disabled={!configured}
            >
               Send test
            </Button>
         </div>
      </form>
   );
}

export function DiscordIntegrationDialog({
   open,
   onOpenChange,
   onSaved,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   onSaved?: (status: NonNullable<DiscordStatus>) => void;
}) {
   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="sm:max-w-lg">
            <DialogHeader>
               <DialogTitle>Discord</DialogTitle>
               <DialogDescription>
                  Configure the webhook used for Flowie workspace notifications.
               </DialogDescription>
            </DialogHeader>
            <DiscordIntegration onSaved={onSaved} />
         </DialogContent>
      </Dialog>
   );
}
