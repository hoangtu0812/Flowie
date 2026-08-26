'use client';

import { Issue } from '@/mock-data/issues';
import { authenticatedFetch } from '@/lib/workspaces';
import { parseAsStringLiteral, useQueryState } from 'nuqs';
import { useEffect, useState } from 'react';

export const MY_ISSUES_TABS = ['assigned', 'created', 'subscribed', 'activity'] as const;
export type MyIssuesTab = (typeof MY_ISSUES_TABS)[number];

export const MY_ISSUES_TAB_ITEMS: { label: string; value: MyIssuesTab }[] = [
   { label: 'Assigned', value: 'assigned' },
   { label: 'Created', value: 'created' },
   { label: 'Subscribed', value: 'subscribed' },
   { label: 'Activity', value: 'activity' },
];

/** Shared tab state (URL-backed) between the header and the page body. */
export function useMyIssuesTab() {
   return useQueryState('tab', parseAsStringLiteral(MY_ISSUES_TABS).withDefault('assigned'));
}

const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Current account identity comes from the durable session, never fixture users. */
export function useCurrentUserId(): string | undefined {
   const [userId, setUserId] = useState<string>();

   useEffect(() => {
      let mounted = true;
      void authenticatedFetch(`${api}/users/me`)
         .then(async (response) => {
            if (!response.ok) return undefined;
            return ((await response.json()) as { data?: { id?: string } }).data?.id;
         })
         .then((id) => {
            if (mounted) setUserId(id);
         })
         .catch(() => {
            if (mounted) setUserId(undefined);
         });
      return () => {
         mounted = false;
      };
   }, []);

   return userId;
}

/** Issues shown by each My issues tab. */
export function scopeMyIssues(issues: Issue[], tab: MyIssuesTab, userId?: string): Issue[] {
   if (!userId) return [];
   const isCreatedByMe = (issue: Issue) => issue.creatorId === userId;
   const isSubscribed = (issue: Issue) => issue.isSubscribed === true;
   const isInMyActivity = (issue: Issue) =>
      issue.assignee?.id === userId || isCreatedByMe(issue) || isSubscribed(issue);
   switch (tab) {
      case 'assigned':
         return issues.filter((issue) => issue.assignee?.id === userId);
      case 'created':
         return issues.filter(isCreatedByMe);
      case 'subscribed':
         return issues.filter(isSubscribed);
      case 'activity':
      default:
         // "Activity" = everything I touch, most recent first.
         return issues
            .filter(isInMyActivity)
            .slice()
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
   }
}
