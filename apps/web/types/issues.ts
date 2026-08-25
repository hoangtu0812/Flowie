import type { LabelInterface } from '@/mock-data/labels';
import type { Priority } from '@/lib/priority-presentations';
import type { Project } from '@/mock-data/projects';
import type { Status } from '@/lib/status-presentations';
import type { User } from '@/mock-data/users';

/** UI shape mapped from the Issue API. It contains no fixture records. */
export interface Issue {
   id: string;
   identifier: string;
   title: string;
   description: string;
   status: Status;
   assignee: User | null;
   creator?: User;
   priority: Priority;
   labels: LabelInterface[];
   createdAt: string;
   team?: { id: string; name: string; identifier: string };
   isSubscribed?: boolean;
   isFavorite?: boolean;
   reminderAt?: string;
   releaseIds?: string[];
   resolution?: 'DUPLICATE' | 'WONT_FIX';
   duplicateOfId?: string;
   hasActivity?: boolean;
   cycleId: string;
   project?: Project;
   subissues?: string[];
   rank: string;
   dueDate?: string;
}

export function groupIssuesByStatus(issues: Issue[]): Record<string, Issue[]> {
   return issues.reduce<Record<string, Issue[]>>((groups, issue) => {
      (groups[issue.status.id] ??= []).push(issue);
      return groups;
   }, {});
}

export function sortIssuesByPriority(issues: Issue[]): Issue[] {
   const priorityOrder: Record<string, number> = {
      'urgent': 0,
      'high': 1,
      'medium': 2,
      'low': 3,
      'no-priority': 4,
   };
   return issues
      .slice()
      .sort((left, right) => priorityOrder[left.priority.id] - priorityOrder[right.priority.id]);
}
