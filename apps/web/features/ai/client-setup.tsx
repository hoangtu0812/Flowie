'use client';
import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { CLIENT_FILES, clientConfig, type ClientName } from './client-config';
import { probeConnection } from './connection-probe';
export function ClientSetup({ endpoint, token }: { endpoint: string; token?: string }) {
   const [client, setClient] = useState<ClientName>('Codex');
   const [message, setMessage] = useState<string>();
   const [error, setError] = useState<string>();
   const [probe, setProbe] = useState<Awaited<ReturnType<typeof probeConnection>>>();
   return (
      <VStack gap={3}>
         <Heading level={3}>Local client setup</Heading>
         <HStack gap={2}>
            {(['Codex', 'Cursor', 'Claude Code'] as const).map((name) => (
               <Button
                  key={name}
                  label={name}
                  aria-pressed={client === name}
                  onClick={() => setClient(name)}
               />
            ))}
         </HStack>
         <Text>
            Merge this configuration into {CLIENT_FILES[client]}. Set FLOWIE_MCP_TOKEN in the
            environment that launches your client, then restart and inspect the available MCP tools.
         </Text>
         <pre className="overflow-auto rounded bg-muted p-3">
            <code>{clientConfig(client, endpoint)}</code>
         </pre>
         <Button
            label="Copy client configuration"
            clickAction={async () => {
               setError(undefined);
               try {
                  await navigator.clipboard.writeText(clientConfig(client, endpoint));
                  setMessage('Configuration copied. It contains no token.');
               } catch {
                  setError('Clipboard is unavailable. Select and copy the configuration manually.');
               }
            }}
         />
         <Text type="supporting">
            Repository access and command execution are controlled separately by your local client.
            Templates do not certify an installed client/version.
         </Text>
         <Button
            label="Check new connection endpoint and grant"
            isDisabled={!token}
            clickAction={async () => {
               setError(undefined);
               setProbe(undefined);
               try {
                  setProbe(await probeConnection(endpoint, token!));
               } catch (reason) {
                  setError(reason instanceof Error ? reason.message : 'Connection check failed.');
               }
            }}
         />
         {!token && (
            <Text type="supporting">
               The endpoint check uses the new token while it is shown once. Existing tokens cannot
               be recovered from Flowie.
            </Text>
         )}
         {probe && (
            <>
               <Text role="status">
                  MCP initialize, tool discovery and scoped access read succeeded.{' '}
                  {probe.tools.length} tools visible.
               </Text>
               <pre className="overflow-auto rounded bg-muted p-3">
                  <code>{JSON.stringify(probe.access, null, 2)}</code>
               </pre>
            </>
         )}
         {message && <Text role="status">{message}</Text>}
         {error && <Text role="alert">{error}</Text>}
      </VStack>
   );
}
