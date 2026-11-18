import type { LabelInterface, SubProjectLabel } from '@/types/labels';
import type { Priority } from '@/lib/priority-presentations';
import type { Project } from '@/types/projects';
import type { Status } from '@/lib/status-presentations';
import type { User } from '@/types/users';

/**
 * Milestone of a project as issues and pickers see it. `projectId`
 * is set on picker options; `completedAt` set means the milestone itself is marked done.
 * VI: Milestone của dự án theo góc nhìn issue và picker. `projectId` có trên lựa chọn của picker;
 * VI: có `completedAt` nghĩa là chính milestone đã được đánh dấu xong.
 */
export interface IssueMilestone {
   id: string;
   title: string;
   projectId?: string;
   targetDate?: string | null;
   completedAt?: string | null;
}

/** UI shape mapped from the Issue API. It contains no fixture records. */
export interface Issue {
   manualOrder?: string;
   id: string;
   identifier: string;
   title: string;
   description: string;
   status: Status;
   assignee: User | null;
   creator?: User;
   priority: Priority;
   labels: LabelInterface[];
   /** Sub projects of the issue's project. VI: Sub project thuộc dự án của issue. */
   subProjectLabels?: SubProjectLabel[];
   /** Milestone of the issue's project, or null. VI: Milestone thuộc dự án của issue, hoặc null. */
   milestone?: IssueMilestone | null;
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
   startDate?: string;
   targetDate?: string;
   estimatedEffort?: number;
   actualEffort?: number;
   dueDate?: string;
   parentIssueId?: string;
   /** Identifier and title of the parent, so the issue page can link to it. */
   parent?: { id: string; identifier: string; title: string };
   /**
    * Parent chain from the top-level issue down to `parent`, returned by the issue lookup only.
    * VI: Chuỗi cha từ issue cấp cao nhất xuống `parent`, chỉ API lookup issue trả về.
    */
   ancestors?: { id: string; identifier: string; title: string }[];
   /** Active direct children and how many of them are completed. */
   subIssueCount?: number;
   completedSubIssueCount?: number;
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
