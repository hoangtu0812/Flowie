'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useIssuesStore } from '@/store/issues-store';
import { authenticatedFetch, loadCurrentWorkspace } from '@/lib/workspaces';
import { responseData } from '@/lib/http';
import { issueQueryParams, type IssueQuery } from './issue-query';

export type InsightValue = {
   id: string;
   label: string;
   filterValue: string;
   avatarUrl?: string | null;
   color?: string;
};
export type IssueInsights = {
   total: number;
   rows: { value: InsightValue; total: number; bySegment: Record<string, number> }[];
   segments: InsightValue[];
};

export function useIssueInsights(slice: string, segment: string, query?: IssueQuery) {
   const { orgId } = useParams<{ orgId: string }>();
   const pageQuery = useIssuesStore((state) => state.pageQuery);
   const loadScope = useIssuesStore((state) => state.loadScope);
   const mutation = useIssuesStore((state) => state.issueMutationEpoch);
   const [refresh, setRefresh] = useState(0);
   const signature = JSON.stringify(query);
   const key = JSON.stringify([
      orgId,
      loadScope,
      pageQuery,
      signature,
      slice,
      segment,
      mutation,
      refresh,
   ]);
   const [result, setResult] = useState<{ key: string; data?: IssueInsights; error?: string }>();
   useEffect(() => {
      let active = true;
      const controller = new AbortController();
      void (async () => {
         try {
            if (!query && !pageQuery) return;
            const workspace = await loadCurrentWorkspace();
            const params = query ? issueQueryParams(query) : new URLSearchParams(pageQuery);
            params.delete('cursor');
            params.set('workspaceId', workspace.id);
            params.set('insights', 'true');
            params.set('sliceBy', slice);
            params.set('segmentBy', segment);
            const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';
            const data = await responseData<IssueInsights>(
               await authenticatedFetch(`${api}/issues?${params}`, { signal: controller.signal })
            );
            if (active) setResult({ key, data });
         } catch (reason) {
            if (active)
               setResult({
                  key,
                  error: reason instanceof Error ? reason.message : 'Could not load report.',
               });
         }
      })();
      return () => {
         active = false;
         controller.abort();
      };
      // The serialized query is the identity of the report scope.
      // eslint-disable-next-line react-hooks/exhaustive-deps
   }, [key]);
   return {
      data: result?.key === key ? result.data : undefined,
      error: result?.key === key ? result.error : undefined,
      retry: () => setRefresh((v) => v + 1),
   };
}
