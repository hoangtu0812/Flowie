'use client';
import { useEffect, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { HStack, VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import {
   getRevisions,
   getRevisionDiff,
   restoreRevision,
   type Revision,
   type RevisionDiff,
} from './document-api';
import type { LiveDocument } from '@/components/common/teams/use-live-team';
import { relativeTime } from '@/lib/time';

export function DocumentHistory({
   id,
   latest,
   beforeRestore,
   onRestore,
}: {
   id: string;
   latest: () => Promise<LiveDocument>;
   beforeRestore: () => Promise<boolean>;
   onRestore: (document: LiveDocument) => Promise<void>;
}) {
   const [items, setItems] = useState<Revision[]>([]);
   const [diff, setDiff] = useState<RevisionDiff>();
   const [selection, setSelection] = useState<number>();
   const [confirmation, setConfirmation] = useState(false);
   const [error, setError] = useState<string>();
   const [loading, setLoading] = useState(true);
   const [refresh, setRefresh] = useState(0);
   useEffect(() => {
      let active = true;
      setLoading(true);
      setError(undefined);
      getRevisions(id)
         .then((result) => {
            if (active) setItems(result.items);
         })
         .catch((reason) => {
            if (active) setError(reason.message);
         })
         .finally(() => {
            if (active) setLoading(false);
         });
      return () => {
         active = false;
      };
   }, [id, refresh]);
   const inspect = async (version: number) => {
      setError(undefined);
      setConfirmation(false);
      setSelection(undefined);
      setDiff(undefined);
      try {
         const result = await getRevisionDiff(id, version);
         setDiff(result);
         setSelection(version);
      } catch (reason) {
         setError(reason instanceof Error ? reason.message : 'Could not load diff.');
      }
   };
   return (
      <VStack as="section" gap={3}>
         <Heading level={2}>Revision history</Heading>
         <Text>Up to 100 recent revisions. Restoring creates a new revision.</Text>
         {loading && <Text role="status">Loading revisions…</Text>}
         {error && <Text role="alert">{error}</Text>}
         <Button label="Refresh history" onClick={() => setRefresh((value) => value + 1)} />
         {items.map((item) => (
            <HStack key={item.version} justify="between" gap={3}>
               <Text>
                  v{item.version} · {item.title} · {relativeTime(item.createdAt)}
               </Text>
               <Button
                  label={`Compare v${item.version}`}
                  clickAction={() => inspect(item.version)}
               />
            </HStack>
         ))}
         {diff && (
            <VStack gap={2}>
               <Text>
                  Title: {diff.fromTitle} → {diff.toTitle}
               </Text>
               <pre className="overflow-auto rounded bg-muted p-4">
                  <code>{diff.diff || 'No content changes.'}</code>
               </pre>
               {diff.truncated && (
                  <Text>
                     The diff is truncated; inspect full revision content before restoring.
                  </Text>
               )}
               <Button
                  label="Restore selected revision"
                  isDisabled={diff.truncated}
                  onClick={() => setConfirmation(true)}
               />
               {confirmation && (
                  <HStack gap={2}>
                     <Text>Replace the current title and content with v{selection}?</Text>
                     <Button
                        label="Confirm restore"
                        variant="destructive"
                        clickAction={async () => {
                           try {
                              if (!selection || !(await beforeRestore())) return;
                              const current = await latest();
                              // The comparison version binds confirmation to the content already reviewed.
                              if (current.version !== diff.toVersion)
                                 throw new Error(
                                    'The document changed since comparison. Compare again before restoring.'
                                 );
                              const restored = await restoreRevision(
                                 id,
                                 selection,
                                 current.version
                              );
                              await onRestore(restored);
                              setDiff(undefined);
                              setConfirmation(false);
                              setRefresh((value) => value + 1);
                           } catch (reason) {
                              setError(
                                 reason instanceof Error
                                    ? reason.message
                                    : 'Could not restore revision.'
                              );
                           }
                        }}
                     />
                     <Button label="Cancel restore" onClick={() => setConfirmation(false)} />
                  </HStack>
               )}
            </VStack>
         )}
      </VStack>
   );
}
