'use client';
import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
type Evidence = {
   status: string;
   reason?: string;
   commit?: string;
   checkedAt?: string;
   scope?: string;
   checks?: { name: string; state: string }[];
};
export function EvidenceVerification({
   workspaceId,
   runId,
}: {
   workspaceId: string;
   runId: string;
}) {
   const [evidence, setEvidence] = useState<Evidence>(),
      [error, setError] = useState<string>();
   return (
      <VStack gap={2}>
         <Text>Run {runId}</Text>
         <Button
            label="Verify current PR and CI"
            clickAction={async () => {
               setEvidence(undefined);
               try {
                  setEvidence(
                     await responseData<Evidence>(
                        await authenticatedFetch(
                           `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1'}/ai-operations/runs/${encodeURIComponent(runId)}/verify-evidence?${new URLSearchParams({ workspaceId })}`,
                           { method: 'POST' }
                        )
                     )
                  );
                  setError(undefined);
               } catch (reason) {
                  setError(reason instanceof Error ? reason.message : 'Could not verify evidence.');
               }
            }}
         />
         {error && <Text role="alert">{error}</Text>}
         {evidence && (
            <>
               <Text role="status">Provider verification: {evidence.status}</Text>
               <Text>{evidence.reason ?? evidence.scope}</Text>
               {evidence.commit && (
                  <Text>
                     Commit {evidence.commit} · checked {evidence.checkedAt}
                  </Text>
               )}
               {evidence.checks?.map((check, index) => (
                  <Text key={index}>
                     {check.name}: {check.state}
                  </Text>
               ))}
            </>
         )}
      </VStack>
   );
}
