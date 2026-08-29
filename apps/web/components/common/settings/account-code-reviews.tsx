'use client';

import { loadCurrentWorkspaceTeams, WorkspaceTeam } from '@/components/common/teams/team-types';
import { Badge } from '@/components/ui/badge';
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
import {
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
   absoluteWebhookUrl,
   createScmConnection,
   deleteScmIdentity,
   loadScmConnections,
   loadScmIdentities,
   loadScmRepositories,
   saveScmIdentity,
   ScmConnection,
   ScmIdentity,
   ScmProvider,
   ScmRepository,
   setScmConnectionActive,
   syncScmConnection,
   updateScmRepository,
} from '@/lib/scm';
import { authenticatedFetch } from '@/lib/workspaces';
import { Cloud, Github, Loader2, Plus, RefreshCw, Trash2, UserRoundCog } from 'lucide-react';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { SettingsCard, SettingsRow, SettingsSection, SettingsShell } from './shared';

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type WorkspaceMember = {
   userId: string;
   status: string;
   user: { id: string; name: string; email: string };
};

function ProviderIcon({ provider }: { provider: ScmProvider }) {
   return provider === 'GITHUB' ? <Github className="size-4" /> : <Cloud className="size-4" />;
}

function ProviderName({ provider }: { provider: ScmProvider }) {
   return provider === 'GITHUB' ? 'GitHub' : 'Azure DevOps';
}

export default function AccountCodeReviews() {
   const [workspaceId, setWorkspaceId] = useState<string>();
   const [teams, setTeams] = useState<WorkspaceTeam[]>([]);
   const [members, setMembers] = useState<WorkspaceMember[]>([]);
   const [connections, setConnections] = useState<ScmConnection[]>([]);
   const [repositories, setRepositories] = useState<ScmRepository[]>([]);
   const [identities, setIdentities] = useState<ScmIdentity[]>([]);
   const [loading, setLoading] = useState(true);
   const [busy, setBusy] = useState<string>();
   const [message, setMessage] = useState<string>();
   const [dialogProvider, setDialogProvider] = useState<ScmProvider>();
   const [displayName, setDisplayName] = useState('');
   const [installationId, setInstallationId] = useState('');
   const [organization, setOrganization] = useState('');
   const [authMode, setAuthMode] = useState<'SERVICE_PRINCIPAL' | 'MANAGED_IDENTITY'>(
      'SERVICE_PRINCIPAL'
   );
   const [tenantId, setTenantId] = useState('');
   const [clientId, setClientId] = useState('');
   const [clientSecret, setClientSecret] = useState('');
   const [createdConnection, setCreatedConnection] = useState<ScmConnection>();
   const [identityConnectionId, setIdentityConnectionId] = useState('');
   const [identityUserId, setIdentityUserId] = useState('');
   const [externalUserId, setExternalUserId] = useState('');

   const load = useCallback(async (clearMessage = true) => {
      setLoading(true);
      if (clearMessage) setMessage(undefined);
      try {
         const workspace = await loadCurrentWorkspaceTeams();
         const [nextConnections, nextRepositories, membersResponse] = await Promise.all([
            loadScmConnections(workspace.workspaceId),
            loadScmRepositories(workspace.workspaceId),
            authenticatedFetch(`${api}/workspaces/${workspace.workspaceId}/members`),
         ]);
         if (!membersResponse.ok) throw new Error('Could not load workspace members.');
         const nextMembers = ((await membersResponse.json()) as { data: WorkspaceMember[] }).data;
         const identityGroups = await Promise.all(
            nextConnections.map((connection) =>
               loadScmIdentities(workspace.workspaceId, connection.id)
            )
         );
         setWorkspaceId(workspace.workspaceId);
         setTeams(workspace.teams);
         setConnections(nextConnections);
         setRepositories(nextRepositories);
         setMembers(nextMembers.filter((member) => member.status === 'ACTIVE'));
         setIdentities(identityGroups.flat());
         setIdentityConnectionId((current) => current || nextConnections[0]?.id || '');
      } catch (error) {
         setMessage(
            error instanceof Error ? error.message : 'Could not load Code & reviews settings.'
         );
      } finally {
         setLoading(false);
      }
   }, []);

   useEffect(() => {
      void load();
   }, [load]);

   function openConnection(provider: ScmProvider) {
      setDialogProvider(provider);
      setCreatedConnection(undefined);
      setDisplayName('');
      setInstallationId('');
      setOrganization('');
      setTenantId('');
      setClientId('');
      setClientSecret('');
      setMessage(undefined);
   }

   async function connect(event: FormEvent) {
      event.preventDefault();
      if (!workspaceId || !dialogProvider) return;
      setBusy('connect');
      setMessage(undefined);
      try {
         const connection = await createScmConnection(
            dialogProvider === 'GITHUB'
               ? {
                    workspaceId,
                    provider: 'GITHUB',
                    externalAccountId: installationId,
                    displayName,
                    authMode: 'INSTALLATION',
                    settings: {},
                 }
               : {
                    workspaceId,
                    provider: 'AZURE_DEVOPS',
                    externalAccountId: organization,
                    displayName,
                    authMode,
                    settings: {
                       organization,
                       ...(authMode === 'SERVICE_PRINCIPAL'
                          ? { tenantId, clientId }
                          : { clientId }),
                    },
                    ...(authMode === 'SERVICE_PRINCIPAL' ? { clientSecret } : {}),
                 }
         );
         setCreatedConnection(connection);
         await load(false);
      } catch (error) {
         setMessage(error instanceof Error ? error.message : 'Could not create the connection.');
      } finally {
         setBusy(undefined);
      }
   }

   async function synchronize(connection: ScmConnection) {
      if (!workspaceId) return;
      setBusy(connection.id);
      setMessage(undefined);
      try {
         const result = await syncScmConnection(workspaceId, connection.id);
         setMessage(
            `Synchronized ${result.repositories} repositories and ${result.reviews} reviews.`
         );
         await load(false);
      } catch (error) {
         setMessage(error instanceof Error ? error.message : 'Could not synchronize the provider.');
      } finally {
         setBusy(undefined);
      }
   }

   async function toggleConnection(connection: ScmConnection) {
      if (!workspaceId) return;
      setBusy(connection.id);
      setMessage(undefined);
      try {
         await setScmConnectionActive(workspaceId, connection.id, connection.status !== 'ACTIVE');
         await load(false);
      } catch (error) {
         setMessage(error instanceof Error ? error.message : 'Could not update the connection.');
      } finally {
         setBusy(undefined);
      }
   }

   async function updateRepository(
      repository: ScmRepository,
      input: { enabled?: boolean; teamId?: string | null }
   ) {
      if (!workspaceId) return;
      setBusy(repository.id);
      setMessage(undefined);
      const next = {
         enabled: input.enabled ?? repository.enabled,
         teamId: input.teamId === undefined ? repository.teamId : input.teamId,
      };
      try {
         await updateScmRepository(workspaceId, repository.id, next);
         setRepositories((items) =>
            items.map((item) => (item.id === repository.id ? { ...item, ...next } : item))
         );
      } catch (error) {
         setMessage(error instanceof Error ? error.message : 'Could not update the repository.');
      } finally {
         setBusy(undefined);
      }
   }

   async function mapIdentity(event: FormEvent) {
      event.preventDefault();
      if (!workspaceId || !identityConnectionId || !identityUserId || !externalUserId.trim())
         return;
      setBusy('identity');
      setMessage(undefined);
      try {
         await saveScmIdentity(workspaceId, identityConnectionId, identityUserId, externalUserId);
         setExternalUserId('');
         await load(false);
      } catch (error) {
         setMessage(error instanceof Error ? error.message : 'Could not map the identity.');
      } finally {
         setBusy(undefined);
      }
   }

   async function unmapIdentity(identity: ScmIdentity) {
      if (!workspaceId) return;
      setBusy(identity.id);
      try {
         await deleteScmIdentity(workspaceId, identity.connectionId, identity.userId);
         await load(false);
      } catch (error) {
         setMessage(
            error instanceof Error ? error.message : 'Could not remove the identity mapping.'
         );
      } finally {
         setBusy(undefined);
      }
   }

   return (
      <>
         <SettingsShell
            title="Code & reviews"
            description="Connect GitHub and Azure DevOps together. Reviews from every enabled repository appear in one provider-neutral workspace view."
         >
            {message && (
               <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{message}</div>
            )}

            <SettingsSection
               title="Source-control connections"
               description="Connections are additive: a workspace can have multiple GitHub installations and Azure DevOps organizations at the same time."
               action={
                  <div className="flex gap-2">
                     <Button size="xs" variant="outline" onClick={() => openConnection('GITHUB')}>
                        <Github className="size-3.5" /> Add GitHub
                     </Button>
                     <Button
                        size="xs"
                        variant="outline"
                        onClick={() => openConnection('AZURE_DEVOPS')}
                     >
                        <Cloud className="size-3.5" /> Add Azure
                     </Button>
                  </div>
               }
            >
               {loading && (
                  <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                     <Loader2 className="size-4 animate-spin" /> Loading connections…
                  </div>
               )}
               {!loading && connections.length === 0 && (
                  <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
                     No source-control provider is connected yet.
                  </div>
               )}
               {connections.map((connection) => (
                  <SettingsCard key={connection.id}>
                     <SettingsRow
                        icon={<ProviderIcon provider={connection.provider} />}
                        title={
                           <>
                              <span>{connection.displayName}</span>
                              <Badge variant="outline">{connection.status.toLowerCase()}</Badge>
                           </>
                        }
                        description={`${ProviderName({ provider: connection.provider })} · ${connection.externalAccountId} · ${connection.enabledRepositoryCount}/${connection.repositoryCount} repositories enabled`}
                        trailing={
                           <>
                              <Button
                                 size="xs"
                                 variant="ghost"
                                 disabled={
                                    busy === connection.id || connection.status === 'REVOKED'
                                 }
                                 onClick={() => void synchronize(connection)}
                              >
                                 {busy === connection.id ? (
                                    <Loader2 className="size-3.5 animate-spin" />
                                 ) : (
                                    <RefreshCw className="size-3.5" />
                                 )}
                                 Sync
                              </Button>
                              <Button
                                 size="xs"
                                 variant="ghost"
                                 onClick={() => void toggleConnection(connection)}
                              >
                                 {connection.status === 'ACTIVE' ? 'Disconnect' : 'Reactivate'}
                              </Button>
                           </>
                        }
                     />
                     {connection.lastError && (
                        <div className="px-4 py-2 text-xs text-destructive">
                           {connection.lastError}
                        </div>
                     )}
                  </SettingsCard>
               ))}
            </SettingsSection>

            <SettingsSection
               title="Repositories"
               description="Map each repository to exactly one Flowie team before enabling it. This mapping is the Reviews access boundary."
            >
               {repositories.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
                     Synchronize an active connection to discover repositories.
                  </div>
               ) : (
                  <SettingsCard>
                     {repositories.map((repository) => {
                        const connection = connections.find(
                           (item) => item.id === repository.connectionId
                        );
                        const active = connection?.status === 'ACTIVE';
                        return (
                           <SettingsRow
                              key={repository.id}
                              icon={<ProviderIcon provider={repository.provider} />}
                              title={repository.fullName}
                              description={`${repository.connectionName}${repository.defaultBranch ? ` · ${repository.defaultBranch}` : ''}`}
                              trailing={
                                 <>
                                    <Select
                                       value={repository.teamId ?? undefined}
                                       onValueChange={(value) =>
                                          void updateRepository(repository, { teamId: value })
                                       }
                                       disabled={!active || busy === repository.id}
                                    >
                                       <SelectTrigger className="h-8 w-40">
                                          <SelectValue placeholder="Select team" />
                                       </SelectTrigger>
                                       <SelectContent>
                                          {teams.map((team) => (
                                             <SelectItem key={team.id} value={team.id}>
                                                {team.name}
                                             </SelectItem>
                                          ))}
                                       </SelectContent>
                                    </Select>
                                    <Switch
                                       checked={repository.enabled}
                                       onCheckedChange={(enabled) =>
                                          void updateRepository(repository, { enabled })
                                       }
                                       disabled={
                                          !active ||
                                          busy === repository.id ||
                                          (!repository.teamId && !repository.enabled)
                                       }
                                       aria-label={`Enable ${repository.fullName}`}
                                    />
                                 </>
                              }
                           />
                        );
                     })}
                  </SettingsCard>
               )}
            </SettingsSection>

            <SettingsSection
               title="Identity mapping"
               description="Map a Flowie member to the provider's immutable user ID. This powers For you, Created, and review notifications without relying on display names."
            >
               <SettingsCard>
                  {identities.map((identity) => (
                     <SettingsRow
                        key={identity.id}
                        icon={<UserRoundCog className="size-4" />}
                        title={identity.flowieName}
                        description={`${connections.find((item) => item.id === identity.connectionId)?.displayName ?? 'Provider'} · ${identity.externalUserId}`}
                        trailing={
                           <Button
                              size="icon"
                              className="size-7"
                              variant="ghost"
                              disabled={busy === identity.id}
                              onClick={() => void unmapIdentity(identity)}
                              aria-label={`Remove mapping for ${identity.flowieName}`}
                           >
                              <Trash2 className="size-3.5" />
                           </Button>
                        }
                     />
                  ))}
                  <form
                     onSubmit={mapIdentity}
                     autoComplete="off"
                     className="grid gap-2 p-4 sm:grid-cols-[1fr_1fr_1fr_auto]"
                  >
                     <Select value={identityConnectionId} onValueChange={setIdentityConnectionId}>
                        <SelectTrigger>
                           <SelectValue placeholder="Connection" />
                        </SelectTrigger>
                        <SelectContent>
                           {connections.map((connection) => (
                              <SelectItem key={connection.id} value={connection.id}>
                                 {connection.displayName}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                     <Select value={identityUserId} onValueChange={setIdentityUserId}>
                        <SelectTrigger>
                           <SelectValue placeholder="Flowie member" />
                        </SelectTrigger>
                        <SelectContent>
                           {members.map((member) => (
                              <SelectItem key={member.userId} value={member.userId}>
                                 {member.user.name}
                              </SelectItem>
                           ))}
                        </SelectContent>
                     </Select>
                     <Input
                        name="provider-user-id"
                        autoComplete="off"
                        value={externalUserId}
                        onChange={(event) => setExternalUserId(event.target.value)}
                        placeholder="Provider user ID"
                     />
                     <Button
                        disabled={
                           busy === 'identity' ||
                           !identityConnectionId ||
                           !identityUserId ||
                           !externalUserId.trim()
                        }
                     >
                        {busy === 'identity' ? (
                           <Loader2 className="size-4 animate-spin" />
                        ) : (
                           <Plus className="size-4" />
                        )}
                        Map
                     </Button>
                  </form>
               </SettingsCard>
            </SettingsSection>

            <SettingsSection title="Current capability boundary">
               <SettingsCard>
                  <SettingsRow
                     title="Read reviews in Flowie"
                     description="Titles, branches, revisions, reviewers, decisions, and Issue links are available."
                     trailing={<Switch checked disabled />}
                  />
                  <SettingsRow
                     title="Write back to providers"
                     description="Comments, approvals, merge, and inline diffs remain provider-side in this rollout."
                     trailing={<Switch checked={false} disabled />}
                  />
               </SettingsCard>
            </SettingsSection>
         </SettingsShell>

         <Dialog
            open={Boolean(dialogProvider)}
            onOpenChange={(open) => !open && setDialogProvider(undefined)}
         >
            <DialogContent className="max-w-xl">
               <DialogHeader>
                  <DialogTitle>
                     Connect{' '}
                     {dialogProvider ? ProviderName({ provider: dialogProvider }) : 'provider'}
                  </DialogTitle>
                  <DialogDescription>
                     {dialogProvider === 'GITHUB'
                        ? 'Use a GitHub App installation with read-only metadata, contents, and pull-request permissions.'
                        : 'Use Microsoft Entra workload identity. Personal access tokens and legacy Azure DevOps OAuth are intentionally unsupported.'}
                  </DialogDescription>
               </DialogHeader>
               {createdConnection ? (
                  <div className="space-y-3 text-sm">
                     <p className="font-medium">
                        Connection created. Configure this webhook at the provider:
                     </p>
                     <Input
                        readOnly
                        value={absoluteWebhookUrl(createdConnection.webhookPath ?? '')}
                     />
                     {createdConnection.webhookUsername && (
                        <div className="grid grid-cols-2 gap-2">
                           <Input readOnly value={createdConnection.webhookUsername} />
                           <Input readOnly value={createdConnection.webhookSecret ?? ''} />
                        </div>
                     )}
                     <p className="text-xs text-muted-foreground">
                        Azure displays this Basic Auth secret only once. Store it in the Service
                        Hook now. GitHub uses the server-level App webhook secret.
                     </p>
                  </div>
               ) : (
                  <form onSubmit={connect} className="space-y-4" autoComplete="off">
                     <div className="space-y-1.5">
                        <Label htmlFor="scm-display-name">Connection name</Label>
                        <Input
                           id="scm-display-name"
                           name="scm-display-name"
                           autoComplete="off"
                           value={displayName}
                           onChange={(event) => setDisplayName(event.target.value)}
                           required
                        />
                     </div>
                     {dialogProvider === 'GITHUB' ? (
                        <div className="space-y-1.5">
                           <Label htmlFor="github-installation">GitHub App installation ID</Label>
                           <Input
                              id="github-installation"
                              name="github-installation-id"
                              autoComplete="off"
                              inputMode="numeric"
                              value={installationId}
                              onChange={(event) => setInstallationId(event.target.value)}
                              required
                           />
                        </div>
                     ) : (
                        <>
                           <div className="space-y-1.5">
                              <Label htmlFor="azure-organization">Azure DevOps organization</Label>
                              <Input
                                 id="azure-organization"
                                 name="azure-organization"
                                 autoComplete="off"
                                 value={organization}
                                 onChange={(event) => setOrganization(event.target.value)}
                                 required
                              />
                           </div>
                           <div className="space-y-1.5">
                              <Label>Authentication</Label>
                              <Select
                                 value={authMode}
                                 onValueChange={(value) => setAuthMode(value as typeof authMode)}
                              >
                                 <SelectTrigger>
                                    <SelectValue />
                                 </SelectTrigger>
                                 <SelectContent>
                                    <SelectItem value="SERVICE_PRINCIPAL">
                                       Microsoft Entra service principal
                                    </SelectItem>
                                    <SelectItem value="MANAGED_IDENTITY">
                                       Azure managed identity
                                    </SelectItem>
                                 </SelectContent>
                              </Select>
                           </div>
                           {authMode === 'SERVICE_PRINCIPAL' && (
                              <div className="grid grid-cols-2 gap-3">
                                 <div className="space-y-1.5">
                                    <Label htmlFor="azure-tenant-id">Tenant ID</Label>
                                    <Input
                                       id="azure-tenant-id"
                                       name="azure-tenant-id"
                                       autoComplete="off"
                                       value={tenantId}
                                       onChange={(event) => setTenantId(event.target.value)}
                                       required
                                    />
                                 </div>
                                 <div className="space-y-1.5">
                                    <Label htmlFor="azure-client-id">Client ID</Label>
                                    <Input
                                       id="azure-client-id"
                                       name="azure-client-id"
                                       autoComplete="off"
                                       value={clientId}
                                       onChange={(event) => setClientId(event.target.value)}
                                       required
                                    />
                                 </div>
                                 <div className="col-span-2 space-y-1.5">
                                    <Label htmlFor="azure-client-secret">Client secret</Label>
                                    <Input
                                       id="azure-client-secret"
                                       name="azure-client-secret"
                                       type="password"
                                       autoComplete="new-password"
                                       value={clientSecret}
                                       onChange={(event) => setClientSecret(event.target.value)}
                                       required
                                    />
                                 </div>
                              </div>
                           )}
                           {authMode === 'MANAGED_IDENTITY' && (
                              <div className="space-y-1.5">
                                 <Label htmlFor="azure-managed-client-id">
                                    Managed identity client ID (optional)
                                 </Label>
                                 <Input
                                    id="azure-managed-client-id"
                                    name="azure-managed-client-id"
                                    autoComplete="off"
                                    value={clientId}
                                    onChange={(event) => setClientId(event.target.value)}
                                 />
                              </div>
                           )}
                        </>
                     )}
                     <DialogFooter>
                        <Button
                           type="button"
                           variant="ghost"
                           onClick={() => setDialogProvider(undefined)}
                        >
                           Cancel
                        </Button>
                        <Button disabled={busy === 'connect'}>
                           {busy === 'connect' && <Loader2 className="size-4 animate-spin" />}{' '}
                           Connect
                        </Button>
                     </DialogFooter>
                  </form>
               )}
            </DialogContent>
         </Dialog>
      </>
   );
}
