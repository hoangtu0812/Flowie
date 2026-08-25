'use client';

import { Issue } from '@/types/issues';
import { parseAsStringLiteral, useQueryState } from 'nuqs';

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

/** Issues shown by each My issues tab. */
export function scopeMyIssues(issues: Issue[], tab: MyIssuesTab, currentUserId?: string): Issue[] {
   if (!currentUserId) return [];
   switch (tab) {
      case 'assigned':
         return issues.filter((issue) => issue.assignee?.id === currentUserId);
      case 'created':
         return issues.filter((issue) => issue.creator?.id === currentUserId);
      case 'subscribed':
         return issues.filter((issue) => issue.isSubscribed);
      case 'activity':
      default:
         return issues
            .filter((issue) => issue.hasActivity)
            .slice()
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
   }
}
