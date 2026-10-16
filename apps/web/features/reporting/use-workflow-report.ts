'use client';
import { useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { reportApi, type WorkflowReport } from './types';
export function useWorkflowReport<T extends WorkflowReport = WorkflowReport>(
   workspace: string,
   body: string,
   kind: 'workflow' | 'dashboard' = 'workflow'
) {
   const [data, setData] = useState<T>(),
      [error, setError] = useState(''),
      [loading, setLoading] = useState(true),
      [revision, setRevision] = useState(0);
   useEffect(() => {
      let active = true;
      setLoading(true);
      setError('');
      setData(undefined);
      void authenticatedFetch(
         `${reportApi}/${kind}?${new URLSearchParams({ workspaceId: workspace })}`,
         { method: 'POST', headers: { 'content-type': 'application/json' }, body }
      )
         .then((response) => responseData<T>(response))
         .then((value) => {
            if (active) setData(value);
         })
         .catch((reason) => {
            if (active) setError(String(reason));
         })
         .finally(() => {
            if (active) setLoading(false);
         });
      return () => {
         active = false;
      };
   }, [workspace, body, kind, revision]);
   return { data, error, loading, reload: () => setRevision((value) => value + 1) };
}
