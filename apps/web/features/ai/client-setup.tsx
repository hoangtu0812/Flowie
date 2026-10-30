'use client';
import { useState } from 'react';
import { Copy, Download, PlugZap } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { SuccessMark } from '@/components/settings/mcp/success-mark';
import {
   CLIENT_FILES,
   CLIENTS,
   clientConfig,
   defaultOs,
   installCommand,
   installLink,
   type ClientName,
   type ClientOs,
} from './client-config';
import { probeConnection } from './connection-probe';

async function copy(value: string, success: string) {
   try {
      await navigator.clipboard.writeText(value);
      toast.success(success);
   } catch {
      toast.error('Clipboard is unavailable. Select and copy the text manually.');
   }
}

export function ClientSetup({ endpoint, token }: { endpoint: string; token?: string }) {
   const [client, setClient] = useState<ClientName>('Claude Code');
   const [os, setOs] = useState<ClientOs>(defaultOs);
   const [probe, setProbe] = useState<Awaited<ReturnType<typeof probeConnection>>>();
   const command = installCommand(client, os, endpoint, token);
   const link = installLink(client, endpoint, token);
   const config = clientConfig(client, endpoint, token);
   return (
      <VStack gap={3}>
         <Heading level={3}>Install in your AI client</Heading>
         <HStack gap={2} vAlign="center" hAlign="between">
            <HStack gap={1}>
               {CLIENTS.map((name) => (
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
               {command &&
                  (['macOS', 'Windows'] as const).map((name) => (
                     <Button
                        key={name}
                        label={name}
                        size="sm"
                        variant={os === name ? 'secondary' : 'ghost'}
                        aria-pressed={os === name}
                        onClick={() => setOs(name)}
                     />
                  ))}
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
            {token
               ? 'The new token is already filled in. Install now: Flowie cannot show this token again.'
               : 'Create a connection to fill in its token. Flowie does not keep tokens, so <FLOWIE_MCP_TOKEN> stays a placeholder here.'}
         </Text>
         {command && (
            <>
               <HStack gap={2} vAlign="center" hAlign="between">
                  <Text>
                     Run this once in {os === 'Windows' ? 'PowerShell' : 'Terminal'}, then restart{' '}
                     {client}.
                  </Text>
                  <Button
                     label="Copy install command"
                     tooltip="Copy install command"
                     icon={<Copy className="size-4" />}
                     isIconOnly
                     size="sm"
                     variant="ghost"
                     clickAction={() => copy(command, 'Install command copied.')}
                  />
               </HStack>
               <pre className="overflow-auto rounded bg-muted p-3">
                  <code>{command}</code>
               </pre>
            </>
         )}
         {link && (
            <HStack gap={2} vAlign="center">
               <Button
                  label={`Add to ${client}`}
                  tooltip={
                     token
                        ? `Open ${client} and confirm the Flowie server`
                        : 'Create a connection to get a one-click install link'
                  }
                  icon={<Download className="size-4" />}
                  size="sm"
                  variant="primary"
                  isDisabled={!token}
                  href={link}
               />
               <Text type="supporting" color="secondary">
                  Or paste the configuration below.
               </Text>
            </HStack>
         )}
         {client !== 'Claude Code' && (
            <>
               <HStack gap={2} vAlign="center" hAlign="between">
                  <Text type="supporting" color="secondary">
                     {command ? 'Manual alternative: merge' : 'Merge'} this into{' '}
                     {CLIENT_FILES[client]}, then restart {client}.
                  </Text>
                  <Button
                     label="Copy client configuration"
                     tooltip="Copy configuration"
                     icon={<Copy className="size-4" />}
                     isIconOnly
                     size="sm"
                     variant="ghost"
                     clickAction={() => copy(config, 'Configuration copied.')}
                  />
               </HStack>
               <pre className="overflow-auto rounded bg-muted p-3">
                  <code>{config}</code>
               </pre>
            </>
         )}
         <Text type="supporting">
            The client stores the token as plain text in its configuration; revoke the connection if
            it leaks. Repository access and command execution are controlled separately by your
            local client.
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
