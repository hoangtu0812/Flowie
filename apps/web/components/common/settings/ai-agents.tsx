'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { List, ListItem } from '@astryxdesign/core/List';
import { DesignSurface } from '@/components/common/design-surface';
import { SettingsShell } from './shared';
import { QueryState } from '@/components/common/query-state';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { getMcpConfiguration, type McpConfiguration } from '@/lib/mcp';
type Providers = { providers: { provider: string; enabled: boolean; configured: boolean }[] };
export default function AiAgents() {
   const { orgId } = useParams<{ orgId: string }>();
   const [data, setData] = useState<{ mcp: McpConfiguration; providers: Providers }>();
   const [error, setError] = useState<string>();
   const [refresh, setRefresh] = useState(0);
   useEffect(() => {
      let active = true;
      setError(undefined);
      setData(undefined);
      void (async () => {
         try {
            const workspace = await loadCurrentWorkspace();
            const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
            const [mcp, providers] = await Promise.all([
               getMcpConfiguration(),
               authenticatedFetch(
                  `${api}/agent/providers?workspaceId=${encodeURIComponent(workspace.id)}`
               ).then(responseData<Providers>),
            ]);
            if (active) setData({ mcp, providers });
         } catch (reason) {
            if (active)
               setError(
                  reason instanceof Error ? reason.message : 'Could not load AI capabilities.'
               );
         }
      })();
      return () => {
         active = false;
      };
   }, [refresh]);
   const configured =
      data?.providers.providers.filter((provider) => provider.enabled && provider.configured) ?? [];
   return (
      <DesignSurface>
         <SettingsShell
            title="AI & Agents"
            description="Capabilities available in this workspace and deployment."
         >
            <VStack as="main" gap={4} width="100%">
               <Link href={`/${orgId}/settings/ai-operations`}>
                  AI operations (workspace administrators)
               </Link>
               {error ? (
                  <QueryState message={error} onRetry={() => setRefresh((value) => value + 1)} />
               ) : !data ? (
                  <Text role="status">Loading capabilities…</Text>
               ) : (
                  <List hasDividers>
                     <ListItem
                        label="Flowie analysis agent"
                        description={
                           configured.length
                              ? `Configured: ${configured.map((provider) => provider.provider).join(', ')}. Analyze work and write planning content.`
                              : 'No enabled provider is configured. Configure a provider to use the workspace agent.'
                        }
                        endContent={
                           <Button
                              label="Agent provider settings"
                              as={Link}
                              href={`/${orgId}/settings/agent-personalization`}
                           />
                        }
                     />
                     <ListItem
                        label="MCP project access"
                        description={
                           data.mcp.enabled
                              ? `Available · ${data.mcp.writesEnabled ? 'scoped reads and writes' : 'read tools only'}. Each client needs an expiring project grant.`
                              : 'Disabled by the deployment. Ask the administrator to enable MCP.'
                        }
                        endContent={
                           <Button
                              label="AI connection center"
                              as={Link}
                              href={`/${orgId}/settings/integrations`}
                           />
                        }
                     />
                     <ListItem
                        label="External coding sessions"
                        description="Clients claim project work and report commits, tests and review evidence through MCP. Execution requires a separately configured local runner and repository permission."
                        endContent={
                           <Button
                              label="Runs and repository instructions"
                              as={Link}
                              href={`/${orgId}/settings/integrations`}
                           />
                        }
                     />
                     <ListItem
                        label="Event automation"
                        description="Workspace managers can configure label-based queues. A granted external agent must claim queued work; the Flowie API does not run repository commands."
                     />
                  </List>
               )}
            </VStack>
         </SettingsShell>
      </DesignSurface>
   );
}
