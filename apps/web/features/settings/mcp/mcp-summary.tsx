'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowUpRight, Copy } from 'lucide-react';
import { HStack } from '@astryxdesign/core/Layout';
import { Button as IconButton } from '@astryxdesign/core/Button';
import { StatusDot } from '@astryxdesign/core/StatusDot';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@/components/ui/button';
import { McpLogo } from '@/features/ai/client-logos';
import { mcpEndpoint } from '@/lib/mcp';
import { useMcpSettings } from './use-mcp-settings';
import { copyText } from './mcp-settings';
import { isInactive } from './connections-table';
import { AgentConfiguration } from './agent-configuration';
import { AgentInstructions } from './agent-instructions';
import { McpLimitsForm } from './mcp-limits';

/**
 * Short MCP card on Settings → Integrations: status, server URL and connection counts. The
 * connection list, New connection and the install guide live on Settings → MCP (Manage).
 * Workspace-wide agent settings for administrators stay below the card.
 * VI: Thẻ MCP ngắn trên Settings → Integrations: trạng thái, URL server và số kết nối. Danh
 * VI: sách kết nối, New connection và hướng dẫn cài đặt nằm ở Settings → MCP (Manage). Cài đặt
 * VI: agent toàn workspace cho quản trị viên vẫn nằm dưới thẻ.
 */
export function McpSummary() {
   const state = useMcpSettings();
   const { orgId } = useParams<{ orgId: string }>();
   const configuration = state.configuration;
   const endpoint = configuration && mcpEndpoint(configuration.endpointPath);
   const inactive = state.connections.filter(isInactive).length;
   const active = state.connections.length - inactive;

   return (
      <>
         <section className="flex flex-col gap-3">
            <h2 className="text-base font-medium">AI connections (MCP)</h2>
            <div className="flex flex-col gap-3 rounded-lg border bg-container p-4">
               <div className="flex items-center gap-3">
                  <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-md border bg-background">
                     <McpLogo className="size-6" />
                  </span>
                  <div className="min-w-0 flex-1">
                     <p className="text-sm font-medium">AI connections (MCP)</p>
                     <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        {configuration ? (
                           <>
                              <StatusDot
                                 variant={configuration.enabled ? 'success' : 'neutral'}
                                 label={configuration.enabled ? 'Available' : 'Disabled'}
                              />
                              <span>
                                 {configuration.enabled
                                    ? configuration.writesEnabled
                                       ? 'MCP is available.'
                                       : 'MCP is available. The server currently allows reading only.'
                                    : 'MCP is disabled. Ask your administrator to enable it.'}{' '}
                                 {active} active · {inactive} inactive connections
                              </span>
                           </>
                        ) : (
                           <span role={state.error ? 'alert' : undefined}>
                              {state.error ?? 'Loading connections…'}
                           </span>
                        )}
                     </div>
                  </div>
                  <Button asChild size="xs" variant="ghost">
                     <Link href={`/${orgId}/settings/mcp`}>
                        Manage
                        <ArrowUpRight className="size-3.5" />
                     </Link>
                  </Button>
               </div>
               {endpoint && (
                  <HStack gap={2} vAlign="end">
                     <TextInput label="Server URL" value={endpoint} isReadOnly width="100%" />
                     <IconButton
                        label="Copy server URL"
                        tooltip="Copy server URL"
                        icon={<Copy className="size-4" />}
                        isIconOnly
                        variant="ghost"
                        clickAction={() => copyText(endpoint, 'Server URL copied.')}
                     />
                  </HStack>
               )}
            </div>
         </section>
         {state.workspaceId && state.canManage && (
            <AgentInstructions workspaceId={state.workspaceId} />
         )}
         {state.workspaceId && state.canManage && <McpLimitsForm workspaceId={state.workspaceId} />}
         {state.workspaceId && state.canManage && (
            <AgentConfiguration workspaceId={state.workspaceId} resources={state.resources} />
         )}
      </>
   );
}
