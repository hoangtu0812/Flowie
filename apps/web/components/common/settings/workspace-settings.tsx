'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { authenticatedFetch, loadCurrentWorkspace, type WorkspaceSummary } from '@/lib/workspaces';
import { Building2, Check, Smile } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

function fallbackIcon(workspace?: WorkspaceSummary) {
   return workspace?.name.slice(0, 2).toUpperCase() ?? 'FL';
}

/** Workspace identity is intentionally a small settings surface so the Circle shell stays unchanged. */
export default function WorkspaceSettings() {
   const [workspace, setWorkspace] = useState<WorkspaceSummary>();
   const [icon, setIcon] = useState('');
   const [saving, setSaving] = useState(false);

   useEffect(() => {
      void loadCurrentWorkspace()
         .then((current) => {
            setWorkspace(current);
            setIcon(current.icon ?? '');
         })
         .catch(() => toast.error('Could not load workspace settings.'));
   }, []);

   const save = async () => {
      if (!workspace) return;
      setSaving(true);
      try {
         const response = await authenticatedFetch(`${api}/workspaces/${workspace.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ icon: icon.trim() || null }),
         });
         if (!response.ok) throw new Error('Could not update workspace icon.');
         const updated = ((await response.json()) as { data: WorkspaceSummary }).data;
         setWorkspace(updated);
         setIcon(updated.icon ?? '');
         window.dispatchEvent(new Event('flowie:workspace-updated'));
         toast.success('Workspace icon updated.');
      } catch (error) {
         toast.error(error instanceof Error ? error.message : 'Could not update workspace icon.');
      } finally {
         setSaving(false);
      }
   };

   return (
      <SettingsShell title="Workspace settings" description="Manage this workspace's identity.">
         <SettingsSection title="General">
            <SettingsCard>
               <SettingsRow
                  icon={<Building2 className="size-4" />}
                  title="Workspace name"
                  description="The name is chosen when the workspace is created."
                  trailing={
                     <span className="max-w-44 truncate">{workspace?.name ?? 'Loading…'}</span>
                  }
               />
               <div className="flex items-center gap-3 px-4 py-3">
                  <span className="inline-flex size-8 items-center justify-center rounded-md bg-muted/50 text-lg shrink-0">
                     {icon.trim() || fallbackIcon(workspace)}
                  </span>
                  <div className="flex-1 min-w-0">
                     <p className="text-sm font-medium">Workspace icon</p>
                     <p className="text-xs text-muted-foreground mt-0.5">
                        Shown in the sidebar and workspace switcher.
                     </p>
                  </div>
                  <div className="flex items-center gap-2">
                     <Smile className="size-4 text-muted-foreground" aria-hidden="true" />
                     <Input
                        aria-label="Workspace icon"
                        value={icon}
                        onChange={(event) => setIcon(event.target.value)}
                        placeholder={fallbackIcon(workspace)}
                        maxLength={16}
                        className="h-8 w-20 text-center"
                     />
                     <Button size="xs" onClick={() => void save()} disabled={!workspace || saving}>
                        <Check className="size-3.5" />
                        {saving ? 'Saving…' : 'Save'}
                     </Button>
                  </div>
               </div>
            </SettingsCard>
         </SettingsSection>
      </SettingsShell>
   );
}
