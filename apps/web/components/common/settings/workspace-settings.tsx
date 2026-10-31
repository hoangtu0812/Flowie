'use client';

import { Button } from '@/components/ui/button';
import { IconPicker } from '@/components/common/icon-picker';
import { Input } from '@/components/ui/input';
import {
   authenticatedFetch,
   loadCurrentWorkspaceMembership,
   type WorkspaceSummary,
} from '@/lib/workspaces';
import { Building2, Check, Link2 } from 'lucide-react';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { DeleteWorkspace } from './delete-workspace';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { appPathname, withBasePath } from '@/lib/base-path';
import { withWorkspaceSegment } from '@/lib/workspace-route';
import { projectSlugError } from '@/components/common/projects/details/project-settings-dialog';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

// First path segments the app owns, the same list as the API. VI: Đoạn path đầu do app dùng, cùng danh sách với API.
const RESERVED_SLUGS = new Set([
   'admin',
   'api',
   'auth',
   'invitations',
   '_next',
   'static',
   'public',
   'health',
   'favicon-ico',
]);

/** Same rules as the API. VI: Cùng quy tắc với API. */
export const workspaceSlugError = (slug: string) =>
   projectSlugError(slug)?.replace('a project id', 'an id') ??
   (RESERVED_SLUGS.has(slug) ? 'This slug is reserved by Flowie.' : undefined);

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

function fallbackIcon(workspace?: WorkspaceSummary) {
   return workspace?.name.slice(0, 2).toUpperCase() ?? 'FL';
}

/**
 * Workspace identity: the URL slug (editable by OWNER and ADMIN, read-only for members) and the
 * icon. A new slug moves the current tab to the new address; earlier slugs keep opening the
 * workspace, so shared links do not break.
 * VI: Định danh workspace: slug URL (OWNER và ADMIN sửa được, thành viên chỉ xem) và icon. Slug
 * VI: mới chuyển tab hiện tại sang địa chỉ mới; slug cũ vẫn mở được workspace nên link đã chia sẻ
 * VI: không bị hỏng.
 */
export default function WorkspaceSettings() {
   const router = useRouter();
   const [workspace, setWorkspace] = useState<WorkspaceSummary>();
   const [icon, setIcon] = useState('');
   const [slug, setSlug] = useState('');
   const [saving, setSaving] = useState(false);
   const [savingSlug, setSavingSlug] = useState(false);
   const [role, setRole] = useState('');
   const canEditSlug = role === 'OWNER' || role === 'ADMIN';
   const slugError = workspaceSlugError(slug);

   useEffect(() => {
      void loadCurrentWorkspaceMembership()
         .then(({ workspace: current, role: currentRole }) => {
            setWorkspace(current);
            setRole(currentRole);
            setIcon(current.icon ?? '');
            setSlug(current.slug);
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

   const saveSlug = async () => {
      if (!workspace || slugError || slug === workspace.slug) return;
      setSavingSlug(true);
      try {
         const response = await authenticatedFetch(`${api}/workspaces/${workspace.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug }),
         });
         if (!response.ok) {
            const payload = (await response.json().catch(() => null)) as {
               message?: string | string[];
            } | null;
            throw new Error(
               Array.isArray(payload?.message)
                  ? payload.message.join(' ')
                  : (payload?.message ?? 'Could not update the workspace URL.')
            );
         }
         const updated = ((await response.json()) as { data: WorkspaceSummary }).data;
         setWorkspace(updated);
         setSlug(updated.slug);
         window.dispatchEvent(new Event('flowie:workspace-updated'));
         toast.success('Workspace URL updated.');
         const { search, hash } = window.location;
         router.replace(withWorkspaceSegment(appPathname(), updated.slug, search + hash));
      } catch (error) {
         toast.error(
            error instanceof Error ? error.message : 'Could not update the workspace URL.'
         );
      } finally {
         setSavingSlug(false);
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
               <VStack gap={2} paddingInline={4} paddingBlock={3}>
                  <HStack gap={2} vAlign="center">
                     <Link2 className="size-4 text-muted-foreground" />
                     <p className="text-sm font-medium">Workspace URL</p>
                  </HStack>
                  <p className="text-xs text-muted-foreground">
                     Links use this slug. Old links (by ID or an earlier slug) keep working after a
                     change; renaming the workspace does not change it.
                  </p>
                  {canEditSlug ? (
                     <HStack gap={2} vAlign="center" wrap="wrap">
                        <Input
                           aria-label="Workspace slug"
                           value={slug}
                           maxLength={63}
                           spellCheck={false}
                           autoCapitalize="none"
                           onChange={(event) => setSlug(event.target.value)}
                           aria-invalid={Boolean(slugError)}
                           className="h-8 w-64 max-w-full"
                        />
                        <Button
                           size="xs"
                           onClick={() => void saveSlug()}
                           disabled={
                              !workspace ||
                              Boolean(slugError) ||
                              slug === workspace.slug ||
                              savingSlug
                           }
                        >
                           <Check className="size-3.5" />
                           {savingSlug ? 'Saving…' : 'Save URL'}
                        </Button>
                     </HStack>
                  ) : null}
                  {slugError && canEditSlug ? (
                     <p className="text-xs text-destructive">{slugError}</p>
                  ) : (
                     <code className="rounded-md bg-muted/50 p-2 text-xs break-all">
                        {workspace
                           ? `${window.location.origin}${withBasePath(`/${slug || workspace.slug}`)}`
                           : 'Loading…'}
                     </code>
                  )}
               </VStack>
               <HStack gap={3} paddingInline={4} paddingBlock={3} vAlign="center" wrap="wrap">
                  <span className="inline-flex size-8 items-center justify-center rounded-md bg-muted/50 text-lg shrink-0">
                     {icon.trim() || fallbackIcon(workspace)}
                  </span>
                  <VStack gap={0.5} className="flex-1 min-w-0">
                     <p className="text-sm font-medium">Workspace icon</p>
                     <p className="text-xs text-muted-foreground mt-0.5">
                        Shown in the sidebar and workspace switcher.
                     </p>
                  </VStack>
                  <HStack gap={2} vAlign="center">
                     <IconPicker value={icon} onChange={setIcon} label="Choose workspace icon" />
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
                  </HStack>
               </HStack>
            </SettingsCard>
         </SettingsSection>
         {role === 'OWNER' && workspace && <DeleteWorkspace workspace={workspace} />}
      </SettingsShell>
   );
}
