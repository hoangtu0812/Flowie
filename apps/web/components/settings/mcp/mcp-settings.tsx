'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Code2, Copy, Eye, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { List, ListItem } from '@astryxdesign/core/List';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { ClientSetup } from '@/features/ai/client-setup';
import { READ_PRESET, CODING_PRESET } from '@/features/ai/client-config';
import { parseInstant } from '@/lib/time';
import { mcpEndpoint, type McpConnection } from '@/lib/mcp';
import { useMcpSettings } from './use-mcp-settings';
import { AgentCoordination } from './agent-coordination';
import { AgentConfiguration } from './agent-configuration';
import { AgentInstructions } from './agent-instructions';
import { SuccessMark } from './success-mark';
import { McpActivity } from './mcp-activity';

const SCOPE_LABELS: Record<string, string> = {
   'context:read': 'Read workspace and team information',
   'projects:read': 'Read projects',
   'issues:read': 'Read tasks and bugs',
   'comments:read': 'Read comments',
   'documents:read': 'Read documents',
   'activities:read': 'Read activity history',
   'reviews:read': 'Read linked code reviews',
   'runs:read': 'Read agent runs',
   'runs:write': 'Claim tasks and report agent results',
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

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`;

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
   const [creating, setCreating] = useState(false);
   /** Connection whose grant the form edits; the token and expiry stay as they are. */
   /** VI: Kết nối đang được sửa quyền trong form; token và hạn dùng giữ nguyên. */
   const [editingId, setEditingId] = useState<string>();
   const [confirmRevokeId, setConfirmRevokeId] = useState<string>();
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
         <Heading level={2}>AI connections (MCP)</Heading>
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
         <List
            hasDividers
            header={
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
            }
         >
            {state.connections.map((connection) => {
               const inactive =
                  Boolean(connection.revokedAt) ||
                  parseInstant(connection.expiresAt).getTime() < Date.now();
               const confirming = confirmRevokeId === connection.id;
               const fresh = state.createdId === connection.id;
               return (
                  <ListItem
                     key={connection.id}
                     label={connection.name}
                     startContent={
                        <motion.span
                           className="inline-flex"
                           initial={fresh ? { scale: 0 } : false}
                           animate={{ scale: 1 }}
                           transition={{ type: 'spring', stiffness: 420, damping: 16 }}
                        >
                           <StatusDot
                              variant={inactive ? 'neutral' : 'success'}
                              label={inactive ? 'Inactive' : 'Active'}
                              isPulsing={fresh}
                           />
                        </motion.span>
                     }
                     description={
                        <Text type="supporting" color="secondary">
                           {inactive ? 'Inactive' : 'Active'} · Expires{' '}
                           {connection.expiresAt.slice(0, 10)} ·{' '}
                           {plural(connection.scopes.length, 'permission')} ·{' '}
                           {connection.projectIds.length
                              ? plural(connection.projectIds.length, 'project')
                              : 'All projects'}
                        </Text>
                     }
                     endContent={
                        confirming ? (
                           <HStack gap={1}>
                              <Button
                                 label="Confirm revoke"
                                 tooltip="Confirm revoke"
                                 icon={<Check className="size-4" />}
                                 isIconOnly
                                 size="sm"
                                 variant="destructive"
                                 isLoading={state.busy}
                                 onClick={() =>
                                    void state
                                       .revoke(connection.id)
                                       .then(() => setConfirmRevokeId(undefined))
                                 }
                              />
                              <Button
                                 label="Keep connection"
                                 tooltip="Keep connection"
                                 icon={<X className="size-4" />}
                                 isIconOnly
                                 size="sm"
                                 variant="ghost"
                                 onClick={() => setConfirmRevokeId(undefined)}
                              />
                           </HStack>
                        ) : (
                           <HStack gap={1}>
                              {connection.ownedByCurrentUser && !inactive && (
                                 <Button
                                    label={`Edit ${connection.name}`}
                                    tooltip="Edit permissions and projects"
                                    icon={<Pencil className="size-4" />}
                                    isIconOnly
                                    size="sm"
                                    variant="ghost"
                                    isDisabled={state.busy || !state.configuration?.enabled}
                                    onClick={() => startEdit(connection)}
                                 />
                              )}
                              <Button
                                 label="Revoke connection"
                                 tooltip="Revoke connection"
                                 icon={<Trash2 className="size-4" />}
                                 isIconOnly
                                 size="sm"
                                 variant="ghost"
                                 isDisabled={inactive || state.busy}
                                 onClick={() => setConfirmRevokeId(connection.id)}
                              />
                           </HStack>
                        )
                     }
                  />
               );
            })}
         </List>
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
                     <List density="compact" header={<Heading level={4}>Allowed teams</Heading>}>
                        {state.resources.teams.map((team) => (
                           <ListItem
                              key={team.id}
                              label={team.name}
                              startContent={
                                 <CheckboxInput
                                    label={team.name}
                                    isLabelHidden
                                    value={teamIds.includes(team.id)}
                                    onChange={(checked) => {
                                       setTeamIds((current) =>
                                          checked
                                             ? [...current, team.id]
                                             : current.filter((id) => id !== team.id)
                                       );
                                       setProjectIds([]);
                                    }}
                                 />
                              }
                           />
                        ))}
                     </List>
                     <List density="compact" header={<Heading level={4}>Allowed projects</Heading>}>
                        {state.resources.projects
                           .filter(
                              (project) =>
                                 !teamIds.length ||
                                 (project.teamId && teamIds.includes(project.teamId))
                           )
                           .map((project) => (
                              <ListItem
                                 key={project.id}
                                 label={project.name}
                                 startContent={
                                    <CheckboxInput
                                       label={project.name}
                                       isLabelHidden
                                       value={projectIds.includes(project.id)}
                                       onChange={(checked) =>
                                          setProjectIds((current) =>
                                             checked
                                                ? [...current, project.id]
                                                : current.filter((id) => id !== project.id)
                                          )
                                       }
                                    />
                                 }
                              />
                           ))}
                     </List>
                     {state.resources.truncated && (
                        <Text color="secondary">
                           Only the first 200 teams and projects are shown.
                        </Text>
                     )}
                     <List density="compact" header={<Heading level={4}>Permissions</Heading>}>
                        {state.configuration.scopes.map((scope) => (
                           <ListItem
                              key={scope}
                              label={SCOPE_LABELS[scope] ?? scope}
                              startContent={
                                 <CheckboxInput
                                    label={SCOPE_LABELS[scope] ?? scope}
                                    isLabelHidden
                                    value={scopes.includes(scope)}
                                    isDisabled={
                                       state.busy ||
                                       (!state.configuration?.writesEnabled &&
                                          !scope.endsWith(':read'))
                                    }
                                    onChange={(checked) =>
                                       setScopes((current) =>
                                          checked
                                             ? [...current, scope]
                                             : current.filter((item) => item !== scope)
                                       )
                                    }
                                 />
                              }
                           />
                        ))}
                     </List>
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
         {state.workspaceId && (
            <McpActivity workspaceId={state.workspaceId} connections={state.connections} />
         )}
         {state.workspaceId && (
            <AgentCoordination workspaceId={state.workspaceId} canManage={state.canManage} />
         )}
         {state.workspaceId && state.canManage && (
            <AgentInstructions workspaceId={state.workspaceId} />
         )}
         {state.workspaceId && state.canManage && (
            <AgentConfiguration
               workspaceId={state.workspaceId}
               resources={state.resources}
               connections={state.connections}
               writesEnabled={state.configuration?.writesEnabled ?? false}
            />
         )}
      </VStack>
   );
}
