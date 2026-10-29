'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Button } from '@astryxdesign/core/Button';
import { List, ListItem } from '@astryxdesign/core/List';
import {
   configureAgentAutomation,
   configureProjectRepository,
   loadProjectRepositories,
   removeProjectRepository,
   type ProjectRepository,
} from '@/lib/agent-runs';
import type { McpConnection, McpResources } from '@/lib/mcp';
import { SuccessMark } from './success-mark';

function parseCommands(value: string): string[][] {
   const commands: unknown = JSON.parse(value);
   if (
      !Array.isArray(commands) ||
      commands.some(
         (command: unknown) =>
            !Array.isArray(command) ||
            !command.length ||
            command.some((arg: unknown) => typeof arg !== 'string')
      )
   ) {
      throw new Error(
         'Enter test commands as arrays of arguments, for example [["pnpm", "test"]].'
      );
   }
   return commands as string[][];
}

export function AgentConfiguration({
   workspaceId,
   resources,
   connections,
   writesEnabled,
}: {
   workspaceId: string;
   resources: McpResources;
   connections: McpConnection[];
   writesEnabled: boolean;
}) {
   const [projectId, setProjectId] = useState('');
   const [repositories, setRepositories] = useState<ProjectRepository[]>([]);
   /** 'new' opens an empty repository form; an id edits that repository. */
   /** VI: 'new' mở form repository trống; một id là sửa repository đó. */
   const [repositoryForm, setRepositoryForm] = useState<'new' | string>();
   const [confirmRemoveId, setConfirmRemoveId] = useState<string>();
   const [repositoryName, setRepositoryName] = useState('');
   const [url, setUrl] = useState('');
   const [branch, setBranch] = useState('main');
   const [commands, setCommands] = useState('[]');
   const [connectionId, setConnectionId] = useState('');
   const [labelId, setLabelId] = useState('');
   const [enabled, setEnabled] = useState(false);
   const [dailyLimit, setDailyLimit] = useState('5');
   const [busy, setBusy] = useState(false);
   /** Cleared before each save so the check mark remounts and replays its animation. */
   const [saved, setSaved] = useState<'repository' | 'automation'>();

   const reloadRepositories = useCallback(async () => {
      try {
         setRepositories(await loadProjectRepositories(workspaceId));
      } catch (cause) {
         toast.error(cause instanceof Error ? cause.message : 'Could not load repositories.');
      }
   }, [workspaceId]);

   useEffect(() => {
      void reloadRepositories();
   }, [reloadRepositories]);

   function openRepositoryForm(repository?: ProjectRepository) {
      setSaved(undefined);
      setRepositoryForm(repository?.id ?? 'new');
      setRepositoryName(repository?.name ?? '');
      setUrl(repository?.repositoryUrl ?? '');
      setBranch(repository?.baseBranch ?? 'main');
      setCommands(JSON.stringify(repository?.testCommands ?? []));
      if (repository) setProjectId(repository.projectId);
   }

   async function save(
      target: 'repository' | 'automation',
      operation: () => Promise<unknown>,
      success: string
   ) {
      setBusy(true);
      setSaved(undefined);
      try {
         await operation();
         setSaved(target);
         toast.success(success);
      } catch (cause) {
         toast.error(cause instanceof Error ? cause.message : 'Could not save configuration.');
      } finally {
         setBusy(false);
      }
   }

   const projectName = (id: string) =>
      resources.projects.find((project) => project.id === id)?.name ?? 'Unknown project';
   const editing = repositories.find((repository) => repository.id === repositoryForm);
   const shownRepositories = repositories.filter(
      (repository) => !projectId || repository.projectId === projectId
   );

   const validLimit =
      Number.isInteger(Number(dailyLimit)) && Number(dailyLimit) >= 1 && Number(dailyLimit) <= 25;
   const eligibleConnections = connections.filter(
      (connection) =>
         connection.ownedByCurrentUser &&
         !connection.revokedAt &&
         connection.scopes.includes('runs:write') &&
         connection.scopes.includes('issues:read') &&
         (!connection.projectIds.length || connection.projectIds.includes(projectId))
   );

   return (
      <VStack gap={3}>
         <Heading level={3}>External coding agent configuration</Heading>
         <Text color="secondary">
            Repository settings tell your coding agent where to work and which tests to run in its
            own environment.
         </Text>
         <Selector
            label="Project"
            value={projectId}
            onChange={(value) => {
               setProjectId(value);
               setConnectionId('');
               setRepositoryForm(undefined);
            }}
            hasSearch
            options={resources.projects.map((project) => ({
               value: project.id,
               label: project.name,
            }))}
         />
         <List
            hasDividers
            header={
               <HStack gap={2} vAlign="center" hAlign="between">
                  <Heading level={4}>Repositories ({shownRepositories.length})</Heading>
                  {!repositoryForm && (
                     <Button
                        label="Add repository"
                        size="sm"
                        variant="secondary"
                        icon={<Plus className="size-4" />}
                        isDisabled={!projectId}
                        tooltip={projectId ? undefined : 'Select a project first'}
                        onClick={() => openRepositoryForm()}
                     />
                  )}
               </HStack>
            }
         >
            {shownRepositories.map((repository) => {
               const confirming = confirmRemoveId === repository.id;
               return (
                  <ListItem
                     key={repository.id}
                     label={repository.name}
                     description={
                        <Text type="supporting" color="secondary">
                           {!projectId && `${projectName(repository.projectId)} · `}
                           {repository.repositoryUrl} · {repository.baseBranch} ·{' '}
                           {repository.testCommands.length} test command
                           {repository.testCommands.length === 1 ? '' : 's'}
                        </Text>
                     }
                     endContent={
                        confirming ? (
                           <HStack gap={1}>
                              <Button
                                 label="Confirm remove"
                                 tooltip="Confirm remove"
                                 icon={<Check className="size-4" />}
                                 isIconOnly
                                 size="sm"
                                 variant="destructive"
                                 isLoading={busy}
                                 onClick={() =>
                                    void save(
                                       'repository',
                                       async () => {
                                          await removeProjectRepository(workspaceId, repository.id);
                                          setConfirmRemoveId(undefined);
                                          if (repositoryForm === repository.id)
                                             setRepositoryForm(undefined);
                                          await reloadRepositories();
                                       },
                                       `Repository "${repository.name}" removed.`
                                    )
                                 }
                              />
                              <Button
                                 label="Keep repository"
                                 tooltip="Keep repository"
                                 icon={<X className="size-4" />}
                                 isIconOnly
                                 size="sm"
                                 variant="ghost"
                                 onClick={() => setConfirmRemoveId(undefined)}
                              />
                           </HStack>
                        ) : (
                           <HStack gap={1}>
                              <Button
                                 label={`Edit ${repository.name}`}
                                 tooltip="Edit repository"
                                 icon={<Pencil className="size-4" />}
                                 isIconOnly
                                 size="sm"
                                 variant="ghost"
                                 isDisabled={busy}
                                 onClick={() => openRepositoryForm(repository)}
                              />
                              <Button
                                 label={`Remove ${repository.name}`}
                                 tooltip="Remove repository"
                                 icon={<Trash2 className="size-4" />}
                                 isIconOnly
                                 size="sm"
                                 variant="ghost"
                                 isDisabled={busy}
                                 onClick={() => setConfirmRemoveId(repository.id)}
                              />
                           </HStack>
                        )
                     }
                  />
               );
            })}
         </List>
         {!shownRepositories.length && (
            <Text color="secondary">
               {projectId
                  ? 'This project has no repositories yet.'
                  : 'No repositories are configured. Select a project to add one.'}
            </Text>
         )}
         {repositoryForm && (
            <VStack gap={3}>
               <HStack gap={2} vAlign="center" hAlign="between">
                  <Heading level={4}>
                     {editing
                        ? `Edit ${editing.name}`
                        : `New repository for ${projectName(projectId)}`}
                  </Heading>
                  <Button
                     label="Close repository form"
                     tooltip="Close"
                     icon={<X className="size-4" />}
                     isIconOnly
                     size="sm"
                     variant="ghost"
                     onClick={() => setRepositoryForm(undefined)}
                  />
               </HStack>
               <HStack gap={3}>
                  <TextInput
                     label="Repository name"
                     value={repositoryName}
                     onChange={setRepositoryName}
                     isRequired
                     width="100%"
                  />
                  <TextInput label="Base branch" value={branch} onChange={setBranch} isRequired />
               </HStack>
               <TextInput
                  label="Repository HTTPS URL"
                  value={url}
                  onChange={setUrl}
                  isRequired
                  description="Use a repository URL without credentials."
               />
               <TextInput
                  label="Test command arguments"
                  value={commands}
                  onChange={setCommands}
                  description={
                     'Example: [["pnpm", "test"]]. Commands run in the external agent environment.'
                  }
               />
               <HStack gap={2} vAlign="center" hAlign="end">
                  <Button
                     label="Cancel"
                     variant="ghost"
                     onClick={() => setRepositoryForm(undefined)}
                  />
                  <Button
                     label="Save repository"
                     variant="primary"
                     icon={<Save className="size-4" />}
                     isLoading={busy}
                     isDisabled={!projectId || repositoryName.trim().length < 2 || !url || !branch}
                     onClick={() =>
                        void save(
                           'repository',
                           async () => {
                              await configureProjectRepository(
                                 workspaceId,
                                 {
                                    projectId,
                                    name: repositoryName,
                                    repositoryUrl: url,
                                    baseBranch: branch,
                                    testCommands: parseCommands(commands),
                                    instructions: editing?.instructions,
                                 },
                                 editing?.id
                              );
                              setRepositoryForm(undefined);
                              await reloadRepositories();
                           },
                           `Repository "${repositoryName.trim()}" saved.`
                        )
                     }
                  />
               </HStack>
            </VStack>
         )}
         <Heading level={4}>Queue work by label</Heading>
         <Text color="secondary">
            Matching project issues enter a durable queue. Your coding agent uses MCP to claim and
            process them.
         </Text>
         <Selector
            label="Agent connection"
            value={connectionId}
            onChange={setConnectionId}
            options={eligibleConnections.map((connection) => ({
               value: connection.id,
               label: connection.name,
            }))}
         />
         <Selector
            label="Issue label"
            value={labelId}
            onChange={setLabelId}
            hasSearch
            options={resources.labels.map((label) => ({ value: label.id, label: label.name }))}
         />
         <TextInput
            label="Maximum runs per day"
            value={dailyLimit}
            onChange={setDailyLimit}
            description="Choose 1 to 25. The connection budget is shared across its rules."
         />
         <CheckboxInput
            label="Enable this automation"
            value={enabled}
            onChange={setEnabled}
            isDisabled={!writesEnabled}
         />
         <HStack gap={2} vAlign="center">
            <Button
               label="Create automation"
               icon={<Plus className="size-4" />}
               isLoading={busy}
               isDisabled={!projectId || !connectionId || !labelId || !validLimit}
               onClick={() =>
                  void save(
                     'automation',
                     () =>
                        configureAgentAutomation(workspaceId, {
                           name: 'Queue labeled project issues',
                           projectId,
                           connectionId,
                           labelId,
                           enabled,
                           dailyLimit: Number(dailyLimit),
                        }),
                     'Automation created. Refresh agent runs to see it.'
                  )
               }
            />
            {saved === 'automation' && <SuccessMark label="Automation created" />}
         </HStack>
      </VStack>
   );
}
