'use client';

import { useState } from 'react';
import { VStack, HStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { TextInput } from '@astryxdesign/core/TextInput';
import { List, ListItem } from '@astryxdesign/core/List';
import { ClientSetup } from '@/features/ai/client-setup';
import { READ_PRESET, CODING_PRESET } from '@/features/ai/client-config';
import { parseInstant } from '@/lib/time';
import { mcpEndpoint } from '@/lib/mcp';
import { useMcpSettings } from './use-mcp-settings';
import { AgentCoordination } from './agent-coordination';
import { AgentConfiguration } from './agent-configuration';

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

export function McpSettings() {
   const state = useMcpSettings();
   const [name, setName] = useState('');
   const [teamIds, setTeamIds] = useState<string[]>([]);
   const [projectIds, setProjectIds] = useState<string[]>([]);
   const [scopes, setScopes] = useState(READ_PRESET);
   const [preset, setPreset] = useState<'read' | 'coding'>('read');
   const [clipboardStatus, setClipboardStatus] = useState<string>();
   const [expires, setExpires] = useState('30');
   const validExpiry =
      Number.isInteger(Number(expires)) && Number(expires) >= 1 && Number(expires) <= 90;

   return (
      <VStack gap={4}>
         <Heading level={2}>AI connections (MCP)</Heading>
         <Text color="secondary">
            Connect an AI client to read project work and perform the actions you allow.
         </Text>
         {state.loading && <Text>Loading connections…</Text>}
         {state.error && <Text role="alert">{state.error}</Text>}
         {state.configuration && (
            <>
               <Text>
                  {state.configuration.enabled
                     ? 'MCP is available.'
                     : 'MCP is disabled. Ask your administrator to enable it.'}
               </Text>
               <TextInput
                  label="Server URL"
                  value={mcpEndpoint(state.configuration.endpointPath)}
                  isReadOnly
               />
               {!state.configuration.writesEnabled && (
                  <Text color="secondary">The server currently allows reading only.</Text>
               )}
               <HStack gap={2}>
                  <Button
                     label="Read-only project preset"
                     onClick={() => {
                        setPreset('read');
                        setScopes(READ_PRESET);
                     }}
                  />
                  <Button
                     label="Coding project preset"
                     isDisabled={!state.configuration.writesEnabled}
                     onClick={() => {
                        setPreset('coding');
                        setScopes(CODING_PRESET);
                     }}
                  />
               </HStack>
               <Text>
                  {preset === 'read'
                     ? 'Read project work without changing it.'
                     : 'Permit work edits, status changes and run evidence within selected projects.'}{' '}
                  Select at least one project before creating a connection.
               </Text>
               <TextInput label="Connection name" value={name} onChange={setName} isRequired />
               <TextInput
                  label="Expires in days"
                  value={expires}
                  onChange={setExpires}
                  description="Choose 1 to 90 days."
               />
               <Text color="secondary">
                  Select teams and projects to limit access. Select one or more projects to keep the
                  connection bounded.
               </Text>
               <List header={<Heading level={3}>Allowed teams</Heading>}>
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
               <List header={<Heading level={3}>Allowed projects</Heading>}>
                  {state.resources.projects
                     .filter(
                        (project) =>
                           !teamIds.length || (project.teamId && teamIds.includes(project.teamId))
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
                  <Text color="secondary">Only the first 200 teams and projects are shown.</Text>
               )}
               <List header={<Heading level={3}>Permissions</Heading>}>
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
                                 (!state.configuration?.writesEnabled && !scope.endsWith(':read'))
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
               <HStack gap={2}>
                  <Button
                     label="Create connection"
                     variant="primary"
                     isLoading={state.busy}
                     isDisabled={
                        !state.configuration.enabled ||
                        name.trim().length < 2 ||
                        !scopes.length ||
                        !validExpiry ||
                        !projectIds.length
                     }
                     onClick={() =>
                        void state.create({
                           name,
                           scopes,
                           teamIds,
                           projectIds,
                           expiresInDays: Number(expires),
                        })
                     }
                  />
               </HStack>
            </>
         )}
         {state.token && (
            <VStack gap={2}>
               {clipboardStatus && <Text role="status">{clipboardStatus}</Text>}
               <Text>Copy this token into your AI client. It is shown once.</Text>
               <TextInput label="Connection token" value={state.token} isReadOnly />
               <HStack gap={2}>
                  <Button
                     label="Copy token"
                     clickAction={async () => {
                        try {
                           await navigator.clipboard.writeText(state.token ?? '');
                           setClipboardStatus('Token copied.');
                        } catch {
                           setClipboardStatus('Clipboard unavailable; copy the token manually.');
                        }
                     }}
                  />
                  <Button label="Dismiss token" variant="ghost" onClick={state.dismissToken} />
               </HStack>
            </VStack>
         )}
         {state.configuration && (
            <ClientSetup
               endpoint={mcpEndpoint(state.configuration.endpointPath)}
               token={state.token}
            />
         )}
         <List hasDividers header={<Heading level={3}>Connections</Heading>}>
            {state.connections.map((connection) => {
               const inactive =
                  Boolean(connection.revokedAt) ||
                  parseInstant(connection.expiresAt).getTime() < Date.now();
               return (
                  <ListItem
                     key={connection.id}
                     label={connection.name}
                     description={
                        <Text type="supporting" color="secondary">
                           {inactive ? 'Inactive' : 'Active'} · Expires{' '}
                           {connection.expiresAt.slice(0, 10)} ·{' '}
                           {connection.scopes
                              .map((scope) => SCOPE_LABELS[scope] ?? scope)
                              .join(', ')}
                        </Text>
                     }
                     endContent={
                        <Button
                           label="Revoke"
                           size="sm"
                           isDisabled={inactive || state.busy}
                           onClick={() => void state.revoke(connection.id)}
                        />
                     }
                  />
               );
            })}
         </List>
         {!state.loading && !state.connections.length && (
            <Text color="secondary">No AI connections have been created.</Text>
         )}
         <List hasDividers header={<Heading level={3}>Recent activity</Heading>}>
            {state.audit.map((event) => (
               <ListItem key={event.id} label={event.action} description={event.createdAt} />
            ))}
         </List>
         {state.workspaceId && (
            <AgentCoordination workspaceId={state.workspaceId} canManage={state.canManage} />
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
