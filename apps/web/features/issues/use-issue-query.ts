'use client';
import { useEffect, useRef, useState } from 'react';
import { useIssuesStore } from '@/store/issues-store';
import { useFilterStore } from '@/store/filter-store';
import { useSearchStore } from '@/store/search-store';
import { useDisplaySettingsStore } from '@/store/display-settings-store';
import { useParams } from 'next/navigation';
import type { IssueQuery } from './issue-query';

export function useIssueQuery(teamReference?: string, input: IssueQuery = {}, enabled = true) {
   const { orgId } = useParams<{ orgId: string }>();
   const { filters } = useFilterStore();
   const { isSearchOpen, searchQuery } = useSearchStore();
   const includeSubIssues = useDisplaySettingsStore((state) => state.showSubIssues);
   const loadIssues = useIssuesStore((state) => state.loadIssues);
   const loading = useIssuesStore((state) => state.loading);
   const [completed, setCompleted] = useState('');
   const options = {
      includeSubIssues,
      ...input,
      filters: [...(input.filters ?? []), ...filters],
      query: isSearchOpen ? searchQuery.trim() : undefined,
   };
   const signature = JSON.stringify(options);
   const key = `${orgId}/${teamReference ?? '*'}/${signature}`;
   const optionsRef = useRef(options);
   optionsRef.current = options;
   useEffect(() => {
      if (!enabled) return;
      useIssuesStore.setState({ loading: true, error: undefined });
      let active = true;
      const timer = setTimeout(
         () => {
            void loadIssues(teamReference, optionsRef.current).finally(() => {
               if (active) setCompleted(key);
            });
         },
         optionsRef.current.query ? 200 : 0
      );
      return () => {
         active = false;
         clearTimeout(timer);
      };
   }, [loadIssues, teamReference, key, enabled]);
   return {
      loading: loading || completed !== key,
      retry: () => loadIssues(teamReference, optionsRef.current),
   };
}
