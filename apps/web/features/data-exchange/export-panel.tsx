'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { CheckboxInput } from '@astryxdesign/core/CheckboxInput';
import { MultiSelector } from '@astryxdesign/core/MultiSelector';
import { VStack } from '@astryxdesign/core/Layout';
import { Heading, Text } from '@astryxdesign/core/Text';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { downloadFile } from '@/features/shared/download-file';
import { exchange, exchangeApi } from './client';

export function DocumentExportPanel({ workspace }: { workspace: string }) {
   const [options, setOptions] = useState<{ id: string; title: string }[]>([]);
   const [after, setAfter] = useState<string | null>('');
   const [selected, setSelected] = useState<string[]>([]);
   const [attachments, setAttachments] = useState(false);
   const [error, setError] = useState('');
   const [busy, setBusy] = useState(false);
   const alive = useRef(true);
   useEffect(() => {
      alive.current = true;
      return () => {
         alive.current = false;
      };
   }, []);
   const load = async (cursor: string) => {
      setBusy(true);
      setError('');
      try {
         const data = await exchange<{
            documents: { id: string; title: string }[];
            nextAfter: string | null;
         }>(`/document-options?${new URLSearchParams({ workspaceId: workspace, after: cursor })}`);
         if (alive.current) {
            setOptions((previous) => [
               ...new Map([...previous, ...data.documents].map((row) => [row.id, row])).values(),
            ]);
            setAfter(data.nextAfter);
         }
      } catch (reason) {
         if (alive.current) setError(String(reason));
      } finally {
         if (alive.current) setBusy(false);
      }
   };
   useEffect(() => {
      void load(''); /* The parent remounts on workspace changes. */
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, []);
   const exportZip = async () => {
      if (busy) return;
      setBusy(true);
      setError('');
      try {
         const response = await authenticatedFetch(exchangeApi + '/documents/export', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
               workspaceId: workspace,
               documentIds: selected,
               includeAttachments: attachments,
            }),
         });
         if (!response.ok) await responseData(response, 'Could not export documents.');
         const content = await response.blob();
         if (alive.current) downloadFile(content, 'flowie-documents.zip');
      } catch (reason) {
         if (alive.current) setError(String(reason));
      } finally {
         if (alive.current) setBusy(false);
      }
   };
   return (
      <VStack gap={3}>
         <Heading level={2}>Export documents</Heading>
         <Text>
            Select up to 100 accessible documents. The ZIP contains Markdown, original source links
            and a manifest; optional stored attachments are limited to 200 files / 25 MB. External
            URLs are preserved without downloading their contents. Original authenticated links
            remain in Markdown.
         </Text>
         <MultiSelector
            label="Documents to export"
            value={selected}
            onChange={setSelected}
            options={options.map((row) => ({ value: row.id, label: row.title }))}
            hasSearch
         />
         <CheckboxInput
            label="Include stored document attachments"
            value={attachments}
            onChange={setAttachments}
         />
         {after !== null && (
            <Button
               label={options.length ? 'Load more document options' : 'Retry document options'}
               isLoading={busy}
               onClick={() => void load(after)}
            />
         )}
         <Button
            label="Export selected documents ZIP"
            isLoading={busy}
            isDisabled={!selected.length || selected.length > 100}
            onClick={() => void exportZip()}
         />
         {error && <Text role="alert">{error}</Text>}
      </VStack>
   );
}
