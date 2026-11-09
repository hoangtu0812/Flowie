'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { AnimatePresence, motion } from 'motion/react';
import { Code2, Copy, Eye, Plus, Save, ScrollText, X } from 'lucide-react';
import { toast } from 'sonner';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Grid } from '@astryxdesign/core/Grid';
import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { ClientSetup } from '@/features/ai/client-setup';
import { READ_PRESET, CODING_PRESET } from '@/features/ai/client-config';
import { mcpEndpoint, type McpConnection } from '@/lib/mcp';
import { useMcpSettings } from './use-mcp-settings';
import { AgentConfiguration } from './agent-configuration';
import { AgentInstructions } from './agent-instructions';
import { SuccessMark } from './success-mark';
import { ConnectionsTable } from './connections-table';
import { McpLogo } from '@/features/ai/client-logos';

const SCOPE_LABELS: Record<string, string> = {
   'context:read': 'Read workspace and team information',
   'projects:read': 'Read projects',
   'issues:read': 'Read tasks and bugs',
   'comments:read': 'Read comments',
   'documents:read': 'Read documents',
   'activities:read': 'Read activity history',
   'reviews:read': 'Read linked code reviews',
   'issues:write': 'Create and edit tasks',
   'issues:transition': 'Change task status',
   'comments:write': 'Write comments',
   'documents:write': 'Write documents',
};

const reveal = {
   initial: { opacity: 0, y: -8 },
   animate: { opacity: 1, y: 0 },
   exit: { opacity: 0, y: -8 },
   transition: { duration: 0.18 },
};

async function copyText(value: string, success: string) {
   try {
      await navigator.clipboard.writeText(value);
      toast.success(success);
   } catch {
      toast.error('Clipboard unavailable; copy the value manually.');
   }
}

export function McpSettings() {
   const state = useMcpSettings();
   const { orgId } = useParams<{ orgId: string }>();
   const [creating, setCreating] = useState(false);
   /** Connection whose grant the form edits; the token and expiry stay as they are. */
   /** VI: Kết nối đang được sửa quyền trong form; token và hạn dùng giữ nguyên. */
   const [editingId, setEditingId] = useState<string>();
   const [name, setName] = useState('');
   const [teamIds, setTeamIds] = useState<string[]>([]);
   const [projectIds, setProjectIds] = useState<string[]>([]);
   const [scopes, setScopes] = useState(READ_PRESET);
   const [preset, setPreset] = useState<'read' | 'coding'>('read');
   const [expires, setExpires] = useState('30');
   const validExpiry =
      Number.isInteger(Number(expires)) && Number(expires) >= 1 && Number(expires) <= 90;
   const endpoint = state.configuration && mcpEndpoint(state.configuration.endpointPath);

   function resetDraft() {
      setName('');
      setTeamIds([]);
      setProjectIds([]);
      setPreset('read');
      setScopes(READ_PRESET);
      setExpires('30');
   }

   function closeForm() {
      resetDraft();
      setCreating(false);
      setEditingId(undefined);
   }

   function startEdit(connection: McpConnection) {
      setName(connection.name);
      setTeamIds(connection.teamIds);
      setProjectIds(connection.projectIds);
      setScopes(connection.scopes);
      setPreset(connection.scopes.includes('issues:write') ? 'coding' : 'read');
      setCreating(false);
      setEditingId(connection.id);
   }

   const formOpen = creating || Boolean(editingId);
   const draft = { name, scopes, teamIds, projectIds };

   return (
      <VStack gap={4}>
         <HStack gap={2} vAlign="center">
            <McpLogo className="size-6 shrink-0" />
            <Heading level={2}>AI connections (MCP)</Heading>
         </HStack>
         <Text color="secondary">
            Connect an AI client to read project work and perform the actions you allow.
         </Text>
         {state.loading && <Text>Loading connections…</Text>}
         {state.error && <Text role="alert">{state.error}</Text>}
         {state.configuration && endpoint && (
            <>
               <HStack gap={2} vAlign="center">
                  <StatusDot
                     variant={state.configuration.enabled ? 'success' : 'neutral'}
                     label={state.configuration.enabled ? 'Available' : 'Disabled'}
                  />
                  <Text type="supporting" color="secondary">
                     {state.configuration.enabled
                        ? state.configuration.writesEnabled
                           ? 'MCP is available.'
                           : 'MCP is available. The server currently allows reading only.'
                        : 'MCP is disabled. Ask your administrator to enable it.'}
                  </Text>
               </HStack>
               <HStack gap={2} vAlign="end">
                  <TextInput label="Server URL" value={endpoint} isReadOnly width="100%" />
                  <Button
                     label="Copy server URL"
                     tooltip="Copy server URL"
                     icon={<Copy className="size-4" />}
                     isIconOnly
                     variant="ghost"
                     clickAction={() => copyText(endpoint, 'Server URL copied.')}
                  />
               </HStack>
            </>
         )}
         <HStack gap={2} vAlign="center" hAlign="between">
            <Heading level={3}>Connections ({state.connections.length})</Heading>
            {state.configuration && !formOpen && (
               <Button
                  label="New connection"
                  size="sm"
                  variant="primary"
                  icon={<Plus className="size-4" />}
                  isDisabled={!state.configuration.enabled}
                  onClick={() => setCreating(true)}
               />
            )}
         </HStack>
         <ConnectionsTable
            connections={state.connections}
            busy={state.busy}
            enabled={Boolean(state.configuration?.enabled)}
            createdId={state.createdId}
            onEdit={startEdit}
            onRevoke={state.revoke}
         />
         {!state.loading && !state.connections.length && (
            <Text color="secondary">No AI connections have been created.</Text>
         )}
         <AnimatePresence>
            {state.token && (
               <motion.div key={state.createdId} {...reveal}>
                  <VStack gap={2}>
                     <HStack gap={2} vAlign="center">
                        <SuccessMark label="Connection created" />
                        <Text>Copy this token into your AI client. It is shown once.</Text>
                     </HStack>
                     <HStack gap={2} vAlign="end">
                        <TextInput
                           label="Connection token"
                           value={state.token}
                           isReadOnly
                           width="100%"
                        />
                        <Button
                           label="Copy token"
                           tooltip="Copy token"
                           icon={<Copy className="size-4" />}
                           isIconOnly
                           clickAction={() => copyText(state.token ?? '', 'Token copied.')}
                        />
                        <Button
                           label="Dismiss token"
                           tooltip="Dismiss token"
                           icon={<X className="size-4" />}
                           isIconOnly
                           variant="ghost"
                           onClick={state.dismissToken}
                        />
                     </HStack>
                  </VStack>
               </motion.div>
            )}
         </AnimatePresence>
         <AnimatePresence>
            {state.configuration && formOpen && (
               <motion.div key={editingId ?? 'create-connection'} {...reveal}>
                  <VStack gap={4}>
                     <HStack gap={2} vAlign="center" hAlign="between">
                        <Heading level={3}>
                           {editingId ? 'Edit connection' : 'New connection'}
                        </Heading>
                        <Button
                           label={
                              editingId ? 'Close edit connection form' : 'Close new connection form'
                           }
                           tooltip="Close"
                           icon={<X className="size-4" />}
                           isIconOnly
                           size="sm"
                           variant="ghost"
                           onClick={closeForm}
                        />
                     </HStack>
                     <HStack gap={2}>
                        <Button
                           label="Read-only project preset"
                           icon={<Eye className="size-4" />}
                           variant={preset === 'read' ? 'primary' : 'secondary'}
                           size="sm"
                           aria-pressed={preset === 'read'}
                           onClick={() => {
                              setPreset('read');
                              setScopes(READ_PRESET);
                           }}
                        >
                           Read-only
                        </Button>
                        <Button
                           label="Coding project preset"
                           icon={<Code2 className="size-4" />}
                           variant={preset === 'coding' ? 'primary' : 'secondary'}
                           size="sm"
                           aria-pressed={preset === 'coding'}
                           isDisabled={!state.configuration.writesEnabled}
                           onClick={() => {
                              setPreset('coding');
                              setScopes(CODING_PRESET);
                           }}
                        >
                           Coding
                        </Button>
                     </HStack>
                     <Text type="supporting" color="secondary">
                        {preset === 'read'
                           ? 'Read project work without changing it.'
                           : 'Permit work edits, status changes and run evidence within selected projects.'}{' '}
                        {editingId
                           ? 'Changes apply from the next MCP call; the token stays the same.'
                           : 'Select at least one project before creating a connection.'}
                     </Text>
                     <HStack gap={3}>
                        <TextInput
                           label="Connection name"
                           value={name}
                           onChange={setName}
                           isRequired
                           width="100%"
                        />
                        {!editingId && (
                           <TextInput
                              label="Expires in days"
                              value={expires}
                              onChange={setExpires}
                              description="Choose 1 to 90 days."
                           />
                        )}
                     </HStack>
                     {/* Searchable multi-selects keep the form short however many teams and
                         projects the workspace has. Changing teams clears the project choice
                         because the project list is narrowed to the selected teams. */}
                     {/* VI: Ô chọn nhiều có tìm kiếm giữ form ngắn dù workspace có bao nhiêu team
                         và dự án. Đổi team xoá lựa chọn dự án vì danh sách dự án chỉ gồm dự án
                         của các team đã chọn. */}
                     <Grid columns={{ minWidth: 260, max: 2 }} gap={3} width="100%">
                        <MultiSelector
                           label="Allowed teams"
                           description="Leave empty to allow every team you can read."
                           value={teamIds}
                           options={state.resources.teams.map((team) => ({
                              value: team.id,
                              label: team.name,
                           }))}
                           onChange={(next) => {
                              setTeamIds(next);
                              setProjectIds([]);
                           }}
                           hasSearch
                           hasSelectAll
                           triggerDisplay="badges"
                           placeholder="All teams"
                           width="100%"
                        />
                        <MultiSelector
                           label="Allowed projects"
                           isRequired
                           value={projectIds}
                           options={state.resources.projects
                              .filter(
                                 (project) =>
                                    !teamIds.length ||
                                    (project.teamId && teamIds.includes(project.teamId))
                              )
                              .map((project) => ({ value: project.id, label: project.name }))}
                           onChange={setProjectIds}
                           hasSearch
                           hasSelectAll
                           triggerDisplay="badges"
                           placeholder="Select projects"
                           width="100%"
                        />
                     </Grid>
                     {state.resources.truncated && (
                        <Text color="secondary">
                           Only the first 200 teams and projects are shown.
                        </Text>
                     )}
                     <Heading level={4}>Permissions</Heading>
                     {/* Read and write scopes sit side by side, each with its own select-all;
                         write scopes are locked while the server only allows reading. */}
                     {/* VI: Quyền đọc và ghi đặt cạnh nhau, mỗi nhóm có ô chọn tất cả riêng;
                         quyền ghi bị khoá khi server chỉ cho đọc. */}
                     <Grid columns={{ minWidth: 260, max: 2 }} gap={4} width="100%">
                        {(['Read', 'Write'] as const).map((group) => {
                           const groupScopes = state.configuration!.scopes.filter(
                              (scope) => scope.endsWith(':read') === (group === 'Read')
                           );
                           const locked =
                              state.busy ||
                              (group === 'Write' && !state.configuration!.writesEnabled);
                           const chosen = groupScopes.filter((scope) => scopes.includes(scope));
                           if (!groupScopes.length) return null;
                           return (
                              <VStack
                                 key={group}
                                 gap={2}
                                 role="group"
                                 aria-label={`${group} permissions`}
                              >
                                 <CheckboxInput
                                    label={`Select all ${group.toLowerCase()} permissions`}
                                    value={
                                       chosen.length === groupScopes.length
                                          ? true
                                          : chosen.length
                                            ? 'indeterminate'
                                            : false
                                    }
                                    isDisabled={locked}
                                    onChange={(checked) =>
                                       setScopes((current) => [
                                          ...current.filter(
                                             (scope) => !groupScopes.includes(scope)
                                          ),
                                          ...(checked ? groupScopes : []),
                                       ])
                                    }
                                 />
                                 <VStack gap={1} className="pl-6">
                                    {groupScopes.map((scope) => (
                                       <CheckboxInput
                                          key={scope}
                                          label={SCOPE_LABELS[scope] ?? scope}
                                          value={scopes.includes(scope)}
                                          isDisabled={locked}
                                          onChange={(checked) =>
                                             setScopes((current) =>
                                                checked
                                                   ? [...current, scope]
                                                   : current.filter((item) => item !== scope)
                                             )
                                          }
                                       />
                                    ))}
                                 </VStack>
                              </VStack>
                           );
                        })}
                     </Grid>
                     <HStack gap={2} hAlign="end">
                        <Button label="Cancel" variant="ghost" onClick={closeForm} />
                        <Button
                           label={editingId ? 'Save connection' : 'Create connection'}
                           variant="primary"
                           icon={
                              editingId ? <Save className="size-4" /> : <Plus className="size-4" />
                           }
                           isLoading={state.busy}
                           isDisabled={
                              !state.configuration.enabled ||
                              name.trim().length < 2 ||
                              !scopes.length ||
                              (!editingId && !validExpiry) ||
                              !projectIds.length
                           }
                           onClick={() =>
                              void (
                                 editingId
                                    ? state.update(editingId, draft)
                                    : state.create({ ...draft, expiresInDays: Number(expires) })
                              ).then((saved) => {
                                 if (saved) closeForm();
                              })
                           }
                        />
                     </HStack>
                  </VStack>
               </motion.div>
            )}
         </AnimatePresence>
         {endpoint && <ClientSetup endpoint={endpoint} token={state.token} />}
         {/* Call history and its dashboard live in Settings → MCP logs. */}
         {/* VI: Lịch sử lời gọi và dashboard nằm ở Settings → MCP logs. */}
         <HStack>
            <Button
               label="View MCP logs"
               variant="secondary"
               icon={<ScrollText className="size-4" />}
               href={`/${orgId}/settings/mcp-logs`}
            />
         </HStack>
         {state.workspaceId && state.canManage && (
            <AgentInstructions workspaceId={state.workspaceId} />
         )}
         {state.workspaceId && state.canManage && (
            <AgentConfiguration workspaceId={state.workspaceId} resources={state.resources} />
         )}
      </VStack>
   );
}
