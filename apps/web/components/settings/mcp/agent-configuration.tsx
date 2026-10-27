'use client';

import { useState } from 'react';
import { Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Button } from '@astryxdesign/core/Button';
import { configureAgentAutomation, configureProjectRepository } from '@/lib/agent-runs';
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
            }}
            hasSearch
            options={resources.projects.map((project) => ({
               value: project.id,
               label: project.name,
            }))}
         />
         <TextInput label="Repository name" value={repositoryName} onChange={setRepositoryName} />
         <TextInput
            label="Repository HTTPS URL"
            value={url}
            onChange={setUrl}
            description="Use a repository URL without credentials."
         />
         <TextInput label="Base branch" value={branch} onChange={setBranch} />
         <TextInput
            label="Test command arguments"
            value={commands}
            onChange={setCommands}
            description={
               'Example: [["pnpm", "test"]]. Commands run in the external agent environment.'
            }
         />
         <HStack gap={2} vAlign="center">
            <Button
               label="Save repository"
               icon={<Save className="size-4" />}
               isLoading={busy}
               isDisabled={!projectId || repositoryName.trim().length < 2 || !url || !branch}
               onClick={() =>
                  void save(
                     'repository',
                     () =>
                        configureProjectRepository(workspaceId, {
                           projectId,
                           name: repositoryName,
                           repositoryUrl: url,
                           baseBranch: branch,
                           testCommands: parseCommands(commands),
                        }),
                     `Repository "${repositoryName.trim()}" saved.`
                  )
               }
            />
            {saved === 'repository' && <SuccessMark label="Repository saved" />}
         </HStack>
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
