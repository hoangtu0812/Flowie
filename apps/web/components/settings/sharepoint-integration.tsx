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
import { toast } from 'sonner';
import { Pending } from './teams-integration';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

export type SharepointConnection = {
   configured: boolean;
   enabled: boolean;
   publishAttachments?: boolean;
   tenantId?: string;
   clientId?: string;
   updatedAt?: string;
};
export type ProjectSharepoint = { folderUrl: string | null; connectionEnabled: boolean };

async function call<T>(path: string, init?: RequestInit) {
   const workspaceId = (await loadCurrentWorkspace()).id;
   const separator = path.includes('?') ? '&' : '?';
   return responseData<T>(
      await authenticatedFetch(
         `${api}/integrations/sharepoint${path}${separator}workspaceId=${workspaceId}`,
         {
            ...init,
            headers: init?.body ? { 'content-type': 'application/json' } : undefined,
         }
      )
   );
}

export const loadSharepointConnection = () => call<SharepointConnection>('');
export const loadProjectSharepoint = (projectId: string) =>
   call<ProjectSharepoint>(`/projects/${encodeURIComponent(projectId)}`);
export const saveProjectSharepoint = (projectId: string, folderUrl: string | null) =>
   call<ProjectSharepoint>(`/projects/${encodeURIComponent(projectId)}`, {
      method: 'PUT',
      body: JSON.stringify({ folderUrl }),
   });
export const testSharepointFolder = (folderUrl: string) =>
   call<{ library: string; folderPath: string }>('/test', {
      method: 'POST',
      body: JSON.stringify({ folderUrl }),
   });

/**
 * Workspace connection for one-way publishing to SharePoint: an Entra app registration
 * with the application permission Sites.Selected, granted write access on the target site
 * by IT. The client secret is write-only; leaving it empty keeps the saved one.
 * VI: Kết nối của workspace để phát hành một chiều lên SharePoint: một app registration
 * VI: trên Entra có quyền application Sites.Selected, được IT cấp quyền ghi trên site đích.
 * VI: Client secret chỉ ghi, không đọc lại; để trống thì giữ secret đã lưu.
 */
function SharepointIntegration({ onSaved }: { onSaved?: (value: SharepointConnection) => void }) {
   const [tenantId, setTenantId] = useState('');
   const [clientId, setClientId] = useState('');
   const [secret, setSecret] = useState('');
   const [enabled, setEnabled] = useState(true);
   const [attachments, setAttachments] = useState(false);
   const [configured, setConfigured] = useState(false);
   const [saving, setSaving] = useState(false);

   useEffect(() => {
      void loadSharepointConnection()
         .then((connection) => {
            setConfigured(connection.configured);
            setEnabled(connection.configured ? connection.enabled : true);
            setAttachments(connection.publishAttachments ?? false);
            setTenantId(connection.tenantId ?? '');
            setClientId(connection.clientId ?? '');
         })
         .catch((error: unknown) =>
            toast.error(error instanceof Error ? error.message : 'Could not load SharePoint.')
         );
   }, []);

   async function save(event: FormEvent) {
      event.preventDefault();
      setSaving(true);
      try {
         const saved = await call<SharepointConnection>('', {
            method: 'PUT',
            body: JSON.stringify({
               tenantId,
               clientId,
               ...(secret ? { clientSecret: secret } : {}),
               enabled,
               publishAttachments: attachments,
            }),
         });
         setConfigured(true);
         setSecret('');
         toast.success('SharePoint connection saved.');
         onSaved?.(saved);
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not save SharePoint.');
      } finally {
         setSaving(false);
      }
   }

   return (
      <form className="space-y-4" onSubmit={save}>
         <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
            <li>
               IT registers an app in Microsoft Entra ID with the Microsoft Graph application
               permission <b>Sites.Selected</b> and grants admin consent.
            </li>
            <li>
               IT grants that app <b>write</b> access on the SharePoint site that holds the
               documents, and creates a client secret.
            </li>
            <li>Enter the tenant ID, client ID and secret here and save.</li>
            <li>
               In each project, open Docs → SharePoint and paste the folder URL. Documents publish
               as .md when their status is Approved.
            </li>
         </ol>
         <div className="grid gap-3">
            <div>
               <Label htmlFor="sp-tenant">Tenant ID</Label>
               <Input
                  id="sp-tenant"
                  className="mt-1"
                  value={tenantId}
                  onChange={(event) => setTenantId(event.target.value)}
                  placeholder="00000000-0000-0000-0000-000000000000 or contoso.onmicrosoft.com"
                  required
               />
            </div>
            <div>
               <Label htmlFor="sp-client">Client (application) ID</Label>
               <Input
                  id="sp-client"
                  className="mt-1"
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  required
               />
            </div>
            <div>
               <Label htmlFor="sp-secret">Client secret</Label>
               <Input
                  id="sp-secret"
                  className="mt-1"
                  type="password"
                  autoComplete="off"
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder={configured ? 'Saved — enter a new secret to replace it' : ''}
                  required={!configured}
               />
            </div>
         </div>
         <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
            <div>
               <p className="text-sm font-medium">Publish approved documents</p>
               <p className="text-xs text-muted-foreground">
                  Turn off to pause publishing without removing the connection.
               </p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
         </div>
         <div className="flex items-center justify-between gap-4 rounded-md border px-3 py-2.5">
            <div>
               <p className="text-sm font-medium">Copy attachments</p>
               <p className="text-xs text-muted-foreground">
                  Copies files attached to issues, comments, projects and Docs folders of projects
                  with a SharePoint folder, existing files included. Anyone who can open that folder
                  sees them, whatever their Flowie team access.
               </p>
            </div>
            <Switch checked={attachments} onCheckedChange={setAttachments} disabled={!enabled} />
         </div>
         <Button type="submit" disabled={saving}>
            {saving && <Pending />}
            {saving ? 'Saving…' : 'Save connection'}
         </Button>
      </form>
   );
}

export function SharepointIntegrationDialog({
   open,
   onOpenChange,
   onSaved,
}: {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   onSaved?: (value: SharepointConnection) => void;
}) {
   return (
      <Dialog open={open} onOpenChange={onOpenChange}>
         <DialogContent className="sm:max-w-lg">
            <DialogHeader>
               <DialogTitle>SharePoint</DialogTitle>
               <DialogDescription>
                  Publish approved project documents to SharePoint as Markdown (one-way).
               </DialogDescription>
            </DialogHeader>
            <SharepointIntegration onSaved={onSaved} />
         </DialogContent>
      </Dialog>
   );
}
