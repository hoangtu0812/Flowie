'use client';
import { useMessages } from '@/features/shared/use-messages';
import { messages } from '@/features/data-exchange/messages.vi';

import { useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { downloadFile } from '@/features/shared/download-file';
import { bulkQuery } from '@/features/issues/bulk-query';
import { exchangeApi } from './client';
import { toast } from 'sonner';

export function useIssueExport(workspace: string, query: string) {
   const tx = useMessages(messages);

   const [busy, setBusy] = useState(false);
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
      try {
         const response = await authenticatedFetch(exchangeApi + '/issues/export', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ workspaceId: workspace, query: bulkQuery(query) }),
         });
         if (!response.ok) await responseData(response, tx('Could not export issues.'));
         const content = await response.blob();
         if (alive.current) downloadFile(content, 'flowie-issues.csv');
      } catch (reason) {
         if (alive.current)
            toast.error(reason instanceof Error ? reason.message : tx('Could not export issues.'));
      } finally {
         if (alive.current) setBusy(false);
      }
   };
   return { run, busy };
}
