'use client';
import { useState } from 'react';
import { Copy, PlugZap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { SuccessMark } from '@/components/settings/mcp/success-mark';
import { CLIENT_FILES, clientConfig, type ClientName } from './client-config';
import { probeConnection } from './connection-probe';
export function ClientSetup({ endpoint, token }: { endpoint: string; token?: string }) {
   const [client, setClient] = useState<ClientName>('Codex');
   const [probe, setProbe] = useState<Awaited<ReturnType<typeof probeConnection>>>();
   return (
      <VStack gap={3}>
         <Heading level={3}>Local client setup</Heading>
         <HStack gap={2} vAlign="center" hAlign="between">
            <HStack gap={1}>
               {(['Codex', 'Cursor', 'Claude Code'] as const).map((name) => (
                  <Button
                     key={name}
                     label={name}
                     size="sm"
                     variant={client === name ? 'primary' : 'ghost'}
                     aria-pressed={client === name}
                     onClick={() => setClient(name)}
                  />
               ))}
            </HStack>
            <HStack gap={1}>
               <Button
                  label="Copy client configuration"
                  tooltip="Copy configuration (contains no token)"
                  icon={<Copy className="size-4" />}
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  clickAction={async () => {
                     try {
                        await navigator.clipboard.writeText(clientConfig(client, endpoint));
                        toast.success('Configuration copied. It contains no token.');
                     } catch {
                        toast.error(
                           'Clipboard is unavailable. Select and copy the configuration manually.'
                        );
                     }
                  }}
               />
               <Button
                  label="Check new connection endpoint and grant"
                  tooltip={
                     token
                        ? 'Check endpoint and grant with the new token'
                        : 'Create a connection to check its endpoint'
                  }
                  icon={<PlugZap className="size-4" />}
                  isIconOnly
                  size="sm"
                  variant="ghost"
                  isDisabled={!token}
                  clickAction={async () => {
                     setProbe(undefined);
                     try {
                        const result = await probeConnection(endpoint, token!);
                        setProbe(result);
                        toast.success(`Connection works. ${result.tools.length} tools visible.`);
                     } catch (reason) {
                        toast.error(
                           reason instanceof Error ? reason.message : 'Connection check failed.'
                        );
                     }
                  }}
               />
            </HStack>
         </HStack>
         <Text type="supporting" color="secondary">
            Merge this configuration into {CLIENT_FILES[client]}. Set FLOWIE_MCP_TOKEN in the
            environment that launches your client, then restart and inspect the available MCP tools.
         </Text>
         <pre className="overflow-auto rounded bg-muted p-3">
            <code>{clientConfig(client, endpoint)}</code>
         </pre>
         <Text type="supporting">
            Repository access and command execution are controlled separately by your local client.
            Templates do not certify an installed client/version.
            {!token &&
               ' The endpoint check uses the new token while it is shown once. Existing tokens cannot be recovered from Flowie.'}
         </Text>
         {probe && (
            <>
               <HStack gap={2} vAlign="center">
                  <SuccessMark label="Connection check succeeded" />
                  <Text role="status">
                     MCP initialize, tool discovery and scoped access read succeeded.{' '}
                     {probe.tools.length} tools visible.
                  </Text>
               </HStack>
               <pre className="overflow-auto rounded bg-muted p-3">
                  <code>{JSON.stringify(probe.access, null, 2)}</code>
               </pre>
            </>
         )}
      </VStack>
   );
}
