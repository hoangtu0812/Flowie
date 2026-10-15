'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '@/lib/workspaces';
import { responseEnvelope } from '@/lib/http';
import type { PageMetadata } from '@/features/issues/issue-query';

export function usePagedResource<T extends { id: string }>(
   url?: string,
   revision?: string,
   body?: string
) {
   const [items, setItems] = useState<T[]>([]);
   const [page, setPage] = useState<PageMetadata>();
   const [loading, setLoading] = useState(!!url);
   const [error, setError] = useState<string>();
   const [refresh, setRefresh] = useState(0);
   const generation = useRef(0);
   const busy = useRef(false);
   const fetchPage = useCallback(
      async (cursor?: string) => {
         if (!url || busy.current) return;
         const request = generation.current;
         busy.current = true;
         setLoading(true);
         setError(undefined);
         try {
            const target = new URL(url, window.location.origin);
            target.searchParams.set('limit', '50');
            if (cursor) target.searchParams.set('cursor', cursor);
            const result = await responseEnvelope<T[], PageMetadata>(
               await authenticatedFetch(
                  target.toString(),
                  body === undefined
                     ? undefined
                     : { method: 'POST', headers: { 'content-type': 'application/json' }, body }
               )
            );
            if (request !== generation.current) return;
            setItems((previous) => [
               ...new Map(
                  [...(cursor ? previous : []), ...result.data].map((row) => [row.id, row])
               ).values(),
            ]);
            setPage(result.meta);
         } catch (reason) {
            if (request === generation.current)
               setError(reason instanceof Error ? reason.message : 'Could not load results.');
         } finally {
            if (request === generation.current) {
               busy.current = false;
               setLoading(false);
            }
         }
      },
      [url, body]
   );
   useEffect(() => {
      generation.current++;
      busy.current = false;
      setLoading(false);
      setItems([]);
      setPage(undefined);
      setError(undefined);
      void fetchPage();
      return () => {
         generation.current++;
         busy.current = false;
      };
   }, [fetchPage, revision, refresh]);
   return {
      items,
      page,
      loading,
      error,
      loadMore: () => fetchPage(page?.nextCursor ?? undefined),
      reload: () => setRefresh((value) => value + 1),
   };
}
