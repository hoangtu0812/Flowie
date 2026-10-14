'use client';

import { useState } from 'react';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { Selector } from '@astryxdesign/core/Selector';
import { Button } from '@astryxdesign/core/Button';
import { configureAgentAutomation, configureProjectRepository } from '@/lib/agent-runs';
import type { McpConnection, McpResources } from '@/lib/mcp';

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
   const [message, setMessage] = useState<string>();
   const [error, setError] = useState<string>();

   async function save(operation: () => Promise<unknown>) {
      setBusy(true);
      setError(undefined);
      setMessage(undefined);
      try {
         await operation();
         setMessage('Configuration saved. Refresh agent runs to see updated automations.');
      } catch (cause) {
         setError(cause instanceof Error ? cause.message : 'Could not save configuration.');
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
         <Button
            label="Save repository"
            isLoading={busy}
            isDisabled={!projectId || repositoryName.trim().length < 2 || !url || !branch}
            onClick={() =>
               void save(() =>
                  configureProjectRepository(workspaceId, {
                     projectId,
                     name: repositoryName,
                     repositoryUrl: url,
                     baseBranch: branch,
                     testCommands: parseCommands(commands),
                  })
               )
            }
         />
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
         <Button
            label="Create automation"
            isLoading={busy}
            isDisabled={!projectId || !connectionId || !labelId || !validLimit}
            onClick={() =>
               void save(() =>
                  configureAgentAutomation(workspaceId, {
                     name: 'Queue labeled project issues',
                     projectId,
                     connectionId,
                     labelId,
                     enabled,
                     dailyLimit: Number(dailyLimit),
                  })
               )
            }
         />
         {message && <Text role="status">{message}</Text>}
         {error && <Text role="alert">{error}</Text>}
      </VStack>
   );
}
