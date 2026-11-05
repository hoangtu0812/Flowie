'use client';

import { Button } from '@/components/ui/button';
import { IconPicker } from '@/components/common/icon-picker';
import { Input } from '@/components/ui/input';
import {
   authenticatedFetch,
   loadCurrentWorkspaceMembership,
   managesWorkspace,
   type WorkspaceSummary,
   type WorkspaceRole,
} from '@/lib/workspaces';
import { Check, Link2 } from 'lucide-react';
import { HStack } from '@astryxdesign/core/HStack';
import { VStack } from '@astryxdesign/core/VStack';
import { AutoJoinSetting } from '@/features/service-desk/auto-join-setting';
import { DeleteWorkspace } from './delete-workspace';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { appPathname, withBasePath } from '@/lib/base-path';
import { withWorkspaceSegment } from '@/lib/workspace-route';
import { projectSlugError } from '@/components/common/projects/details/project-settings-dialog';
import { SettingsCard, SettingsSection, SettingsShell } from './shared';
import { WorkspaceNameSetting } from './workspace-name-setting';

// First path segments the app owns, the same list as the API. VI: Đoạn path đầu do app dùng, cùng danh sách với API.
const RESERVED_SLUGS = new Set([
   'admin',
   'api',
   'auth',
   'invitations',
   'servicedesk',
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
 * Workspace identity: display name, URL slug and icon. OWNER/ADMIN can edit names and slugs;
 * other members see the name. A name edit preserves URLs; a slug edit moves the current tab,
 * while earlier slugs still open the workspace so shared links keep working.
 * VI: Định danh workspace gồm tên hiển thị, slug URL và icon. OWNER/ADMIN sửa được tên và slug;
 * VI: thành viên khác chỉ xem tên. Sửa tên giữ nguyên URL; sửa slug chuyển địa chỉ tab hiện tại,
 * VI: còn slug cũ vẫn mở workspace để link đã chia sẻ tiếp tục hoạt động.
 */
export default function WorkspaceSettings() {
   const { orgId } = useParams<{ orgId: string }>();
   const router = useRouter();
   const [workspace, setWorkspace] = useState<WorkspaceSummary>();
   const [icon, setIcon] = useState('');
   const [slug, setSlug] = useState('');
   const [saving, setSaving] = useState(false);
   const [savingSlug, setSavingSlug] = useState(false);
   const [role, setRole] = useState<WorkspaceRole>();
   const canEditSlug = role === 'OWNER' || role === 'ADMIN';
   const slugError = workspaceSlugError(slug);

   useEffect(() => {
      let active = true;
      setWorkspace(undefined);
      setRole(undefined);
      void loadCurrentWorkspaceMembership()
         .then(({ workspace: current, role: currentRole }) => {
            if (!active) return;
            setWorkspace(current);
            setRole(currentRole);
            setIcon(current.icon ?? '');
            setSlug(current.slug);
         })
         .catch(() => {
            if (active) toast.error('Could not load workspace settings.');
         });
      return () => {
         active = false;
      };
   }, [orgId]);

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
               {workspace && (
                  <WorkspaceNameSetting
                     key={workspace.id}
                     workspace={workspace}
                     canEdit={!!role && managesWorkspace(role)}
                     onSaved={(updated) =>
                        setWorkspace((current) => (current?.id === updated.id ? updated : current))
                     }
                  />
               )}
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
         {role && managesWorkspace(role) && workspace && (
            <AutoJoinSetting key={workspace.id} workspaceId={workspace.id} />
         )}
         {role === 'OWNER' && workspace && <DeleteWorkspace workspace={workspace} />}
      </SettingsShell>
   );
}
