'use client';

import {
   Pending,
   TEAMS_WEBHOOK_PLACEHOLDER,
   TeamsTestButton,
   microsoftSignInEnabled,
   withTeamsToast,
   type TeamsStatus,
} from '@/components/settings/teams-integration';
import { Button } from '@/components/ui/button';
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
import { Switch } from '@/components/ui/switch';
import { responseData } from '@/lib/http';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { MessagesSquare } from 'lucide-react';
import { useParams } from 'next/navigation';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/**
 * "MS Teams" property row for a project. It renders nothing unless Microsoft
 * sign-in is configured, matching the API gate.
 */
export function ProjectTeamsChannel({
   projectId,
   row,
}: {
   projectId: string;
   row: (label: string, children: ReactNode) => ReactNode;
}) {
   const { orgId } = useParams<{ orgId: string }>();
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [status, setStatus] = useState<TeamsStatus>(null);
   const [canManage, setCanManage] = useState(false);
   const [open, setOpen] = useState(false);
   const [url, setUrl] = useState('');
   const [channelName, setChannelName] = useState('');
   const [enabled, setEnabled] = useState(true);
   const [pending, setPending] = useState<'save' | 'disconnect'>();

   useEffect(() => {
      let current = true;
      void (async () => {
         if (!(await microsoftSignInEnabled())) return;
         const workspace = (await loadCurrentWorkspace(orgId)).id;
         const response = await authenticatedFetch(
            `${api}/integrations/teams/projects/${projectId}?workspaceId=${workspace}`
         );
         if (!response.ok || !current) return;
         const payload = (await response.json()) as { data: TeamsStatus; canManage: boolean };
         setWorkspaceId(workspace);
         setStatus(payload.data);
         setCanManage(payload.canManage);
      })().catch(() => undefined);
      return () => {
         current = false;
      };
   }, [orgId, projectId]);

   if (!workspaceId) return null;
   const endpoint = `${api}/integrations/teams/projects/${projectId}`;
   const query = `?workspaceId=${workspaceId}`;

   function openDialog() {
      setUrl('');
      setChannelName(status?.channelName ?? '');
      setEnabled(status?.enabled ?? true);
      setOpen(true);
   }

   async function save(event: FormEvent) {
      event.preventDefault();
      setPending('save');
      const saved = await withTeamsToast(
         authenticatedFetch(`${endpoint}${query}`, {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...(url ? { webhookUrl: url } : {}), channelName, enabled }),
         }).then((response) =>
            responseData<TeamsStatus>(response, 'Could not save the Microsoft Teams channel.')
         ),
         'Saving Microsoft Teams channel…',
         'Microsoft Teams channel saved.'
      );
      setPending(undefined);
      if (!saved) return;
      setStatus(saved);
      setUrl('');
   }

   async function disconnect() {
      setPending('disconnect');
      const removed = await withTeamsToast(
         authenticatedFetch(`${endpoint}${query}`, { method: 'DELETE' })
            .then((response) =>
               responseData<null>(response, 'Could not disconnect the Microsoft Teams channel.')
            )
            .then(() => true),
         'Disconnecting Microsoft Teams channel…',
         'Microsoft Teams channel disconnected.'
      );
      setPending(undefined);
      if (!removed) return;
      setStatus(null);
      setOpen(false);
   }

   const label = status
      ? `${status.channelName || 'Teams channel'}${status.enabled ? '' : ' (off)'}`
      : 'Connect channel';

   return (
      <>
         {row(
            'MS Teams',
            <button
               type="button"
               disabled={!canManage}
               onClick={openDialog}
               className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors disabled:hover:text-muted-foreground"
            >
               <MessagesSquare className="size-3.5" />
               <span className="truncate max-w-44">{label}</span>
            </button>
         )}
         <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-lg">
               <DialogHeader>
                  <DialogTitle>Connect Microsoft Teams channel</DialogTitle>
                  <DialogDescription>
                     Events for this project and its issues are posted to this channel.
                  </DialogDescription>
               </DialogHeader>
               <form id="project-teams-channel" className="space-y-4" onSubmit={save}>
                  <div>
                     <Label htmlFor="project-teams-name">Channel name</Label>
                     <Input
                        id="project-teams-name"
                        className="mt-1"
                        value={channelName}
                        maxLength={120}
                        onChange={(event) => setChannelName(event.target.value)}
                        placeholder="e.g. DTD / General"
                     />
                  </div>
                  <div>
                     <Label htmlFor="project-teams-url">Teams Workflows webhook URL</Label>
                     <Input
                        id="project-teams-url"
                        className="mt-1"
                        type="url"
                        value={url}
                        onChange={(event) => setUrl(event.target.value)}
                        placeholder={
                           status
                              ? 'Configured — enter a new URL to replace it'
                              : TEAMS_WEBHOOK_PLACEHOLDER
                        }
                     />
                     <p className="mt-1.5 text-xs text-muted-foreground">
                        In the Teams channel, add the workflow “Post to a channel when a webhook
                        request is received” and paste its URL here.
                     </p>
                  </div>
                  <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
                     <p className="text-sm font-medium">Send notifications to this channel</p>
                     <Switch checked={enabled} onCheckedChange={setEnabled} />
                  </div>
               </form>
               <DialogFooter className="gap-2 sm:justify-between">
                  {status ? (
                     <div className="flex gap-2">
                        <Button
                           type="button"
                           variant="outline"
                           disabled={Boolean(pending)}
                           onClick={() => void disconnect()}
                        >
                           {pending === 'disconnect' && <Pending />}
                           {pending === 'disconnect' ? 'Disconnecting…' : 'Disconnect'}
                        </Button>
                        <TeamsTestButton path={`/projects/${projectId}/test${query}`} />
                     </div>
                  ) : (
                     <span />
                  )}
                  <Button
                     type="submit"
                     form="project-teams-channel"
                     disabled={Boolean(pending) || (!status && !url)}
                  >
                     {pending === 'save' && <Pending />}
                     {pending === 'save' ? 'Saving…' : 'Save'}
                  </Button>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </>
   );
}
