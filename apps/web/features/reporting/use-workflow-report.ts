'use client';
import { useEffect, useState } from 'react';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { reportApi, type WorkflowReport } from './types';
export function useWorkflowReport(workspace: string, body: string) {
   const [data, setData] = useState<WorkflowReport>(),
      [error, setError] = useState(''),
      [loading, setLoading] = useState(true),
      [revision, setRevision] = useState(0);
   useEffect(() => {
      let active = true;
      setLoading(true);
      setError('');
      setData(undefined);
      void authenticatedFetch(
         `${reportApi}/workflow?${new URLSearchParams({ workspaceId: workspace })}`,
         { method: 'POST', headers: { 'content-type': 'application/json' }, body }
      )
         .then((response) => responseData<WorkflowReport>(response))
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
   }, [workspace, body, revision]);
   return { data, error, loading, reload: () => setRevision((value) => value + 1) };
}
