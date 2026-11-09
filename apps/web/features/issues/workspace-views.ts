import type { IssueQuery } from './issue-query';
import type { StatusCategory } from '@/lib/status-presentations';

export const workspaceIssueViews: Array<{
   segment: string;
   label: string;
   categories?: StatusCategory[];
   query?: IssueQuery;
}> = [
   { segment: '', label: 'All issues' },
   { segment: 'active', label: 'Active', categories: ['unstarted', 'started'] },
   { segment: 'backlog', label: 'Backlog', categories: ['backlog', 'triage'] },
   { segment: 'bugs', label: 'Bugs', query: { issueType: 'BUG' } },
   { segment: 'no-team', label: 'No team', query: { noTeam: true } },
   { segment: 'no-project', label: 'No project', query: { noProject: true } },
];
