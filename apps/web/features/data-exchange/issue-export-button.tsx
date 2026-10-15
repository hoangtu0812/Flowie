'use client';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Text } from '@astryxdesign/core/Text';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { useIssuesStore } from '@/store/issues-store';
import { downloadFile } from '@/features/shared/download-file';
import { bulkQuery } from '@/features/issues/bulk-query';
import { exchangeApi } from './client';

export function IssueExportButton() {
   const { workspaceId, pageQuery, accountId } = useIssuesStore();
   return workspaceId && pageQuery ? (
      <ExportButton
         key={`${accountId}:${workspaceId}:${pageQuery}`}
         workspace={workspaceId}
         query={pageQuery}
      />
   ) : null;
}
function ExportButton({ workspace, query }: { workspace: string; query: string }) {
   const [busy, setBusy] = useState(false),
      [error, setError] = useState('');
   const alive = useRef(true);
   useEffect(() => {
      alive.current = true;
      return () => {
         alive.current = false;
      };
   }, []);
   const run = async () => {
      if (busy) return;
      setBusy(true);
      setError('');
      try {
         const response = await authenticatedFetch(exchangeApi + '/issues/export', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId: workspace, query: bulkQuery(query) }),
         });
         if (!response.ok) await responseData(response, 'Could not export issues.');
         const content = await response.blob();
         if (alive.current) downloadFile(content, 'flowie-issues.csv');
      } catch (reason) {
         if (alive.current)
            setError(reason instanceof Error ? reason.message : 'Could not export issues.');
      } finally {
         if (alive.current) setBusy(false);
      }
   };
   return (
      <>
         <Button label="Export matching issues CSV" isLoading={busy} onClick={() => void run()} />
         {error && <Text role="alert">{error}</Text>}
      </>
   );
}
