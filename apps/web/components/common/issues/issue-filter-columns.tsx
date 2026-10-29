'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { createColumnConfigHelper } from '@/components/data-table-filter/core/filters';
import type { ColumnOption, FiltersState } from '@/components/data-table-filter/core/types';
import { multiOptionFilterFn, optionFilterFn } from '@/components/data-table-filter/lib/filter-fns';
import { cycles, cycleStatusLabel } from '@/mock-data/cycles';
import { Issue } from '@/mock-data/issues';
import { labels } from '@/mock-data/labels';
import { priorities } from '@/mock-data/priorities';
import { status, StatusCategory } from '@/mock-data/status';
import type { Project } from '@/mock-data/projects';
import type { User } from '@/mock-data/users';
import {
   BarChart3,
   CircleCheck,
   CircleDashed,
   CircleUserRound,
   Folder,
   RefreshCcw,
   Tag,
} from 'lucide-react';

/* -------------------------------------------------------------------------- */
/*                                Option lists                                */
/* -------------------------------------------------------------------------- */

const statusOptions: ColumnOption[] = status.map((item) => ({
   value: item.id,
   label: item.name,
   icon: <item.icon />,
}));

const STATUS_TYPES: { id: StatusCategory; name: string }[] = [
   { id: 'triage', name: 'Triage' },
   { id: 'backlog', name: 'Backlog' },
   { id: 'unstarted', name: 'Unstarted' },
   { id: 'started', name: 'Started' },
   { id: 'completed', name: 'Completed' },
   { id: 'canceled', name: 'Canceled' },
];

const statusTypeOptions: ColumnOption[] = STATUS_TYPES.map((item) => ({
   value: item.id,
   label: item.name,
   icon: <CircleDashed className="size-4 text-muted-foreground" />,
}));

// Assignee and Project choices come from the scope's real members and projects
// (`GET /issues/options`, kept in the issues store), so their values match the
// ids the accessors read from loaded issues. Mock ids would match no issue.
// VI: Lựa chọn Assignee và Project lấy từ thành viên và dự án thật của phạm vi
// (`GET /issues/options`, lưu trong issues store) để giá trị khớp id mà accessor
// đọc từ task đã tải. Id dữ liệu mẫu sẽ không khớp task nào.
const assigneeOptions = (members: User[]): ColumnOption[] => [
   {
      value: 'unassigned',
      label: 'Unassigned',
      icon: <CircleUserRound className="size-4 text-muted-foreground" />,
   },
   ...members.map((user) => ({
      value: user.id,
      label: user.name,
      icon: (
         <Avatar className="size-4">
            <AvatarImage src={user.avatarUrl} alt={user.name} />
            <AvatarFallback>{user.name[0]}</AvatarFallback>
         </Avatar>
      ),
   })),
];

const priorityOptions: ColumnOption[] = priorities.map((priority) => ({
   value: priority.id,
   label: priority.name,
   icon: <priority.icon className="size-4 text-muted-foreground" />,
}));

const labelOptions: ColumnOption[] = labels.map((label) => ({
   value: label.id,
   label: label.name,
   icon: <span className="size-2.5 rounded-full" style={{ backgroundColor: label.color }} />,
}));

const projectOptions = (projects: Project[]): ColumnOption[] =>
   projects.map((project) => ({
      value: project.id,
      label: project.name,
      icon: <project.icon className="size-4 text-muted-foreground" />,
   }));

const cycleOptions: ColumnOption[] = [
   {
      value: 'no-cycle',
      label: 'No cycle',
      icon: <RefreshCcw className="size-4 text-muted-foreground" />,
   },
   ...cycles.map((cycle) => ({
      value: cycle.id,
      label: `${cycle.name} (${cycleStatusLabel[cycle.status]})`,
      icon: <RefreshCcw className="size-4 text-muted-foreground" />,
   })),
];

/* -------------------------------------------------------------------------- */
/*                              Column definitions                            */
/* -------------------------------------------------------------------------- */

const dtf = createColumnConfigHelper<Issue>();

/**
 * Filterable issue columns for the bazza/ui data-table-filter component.
 * Accessors return the raw values the filter functions compare against.
 * `members` and `projects` are the issues store's lists for the loaded scope.
 * VI: Các cột lọc task cho data-table-filter của bazza/ui. Accessor trả giá trị
 * gốc để hàm lọc so sánh. `members` và `projects` là danh sách của issues store
 * cho phạm vi đang tải.
 */
export const createIssueFilterColumns = (members: User[], projects: Project[]) =>
   [
      dtf
         .option()
         .id('status')
         .accessor((issue: Issue) => issue.status.id)
         .displayName('Status')
         .icon(CircleCheck)
         .options(statusOptions)
         .build(),
      dtf
         .option()
         .id('statusType')
         .accessor((issue: Issue) => issue.status.category)
         .displayName('Status type')
         .icon(CircleDashed)
         .options(statusTypeOptions)
         .build(),
      dtf
         .option()
         .id('assignee')
         .accessor((issue: Issue) => issue.assignee?.id ?? 'unassigned')
         .displayName('Assignee')
         .icon(CircleUserRound)
         .options(assigneeOptions(members))
         .build(),
      dtf
         .option()
         .id('priority')
         .accessor((issue: Issue) => issue.priority.id)
         .displayName('Priority')
         .icon(BarChart3)
         .options(priorityOptions)
         .build(),
      dtf
         .multiOption()
         .id('labels')
         .accessor((issue: Issue) => issue.labels.map((label) => label.id))
         .displayName('Labels')
         .icon(Tag)
         .options(labelOptions)
         .build(),
      dtf
         .option()
         .id('project')
         .accessor((issue: Issue) => issue.project?.id ?? '')
         .displayName('Project')
         .icon(Folder)
         .options(projectOptions(projects))
         .build(),
      dtf
         .option()
         .id('cycle')
         .accessor((issue: Issue) => (issue.cycleId === '' ? 'no-cycle' : issue.cycleId))
         .displayName('Cycle')
         .icon(RefreshCcw)
         .options(cycleOptions)
         .build(),
      dtf
         .option()
         .id('issueType')
         .accessor((issue: Issue) => issue.issueType ?? 'TASK')
         .displayName('Issue type')
         .icon(CircleDashed)
         .options([
            { value: 'TASK', label: 'Task' },
            { value: 'BUG', label: 'Bug' },
         ])
         .build(),
      dtf
         .option()
         .id('severity')
         .accessor((issue: Issue) => issue.severity ?? 'NONE')
         .displayName('Severity')
         .icon(BarChart3)
         .options(
            ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((value) => ({
               value,
               label: value === 'NONE' ? 'Unspecified' : value,
            }))
         )
         .build(),
   ] as const;

// Filtering only reads accessors, which do not depend on the option lists.
// VI: Việc lọc chỉ dùng accessor, không phụ thuộc danh sách lựa chọn.
const columnById = new Map<string, ReturnType<typeof createIssueFilterColumns>[number]>(
   createIssueFilterColumns([], []).map((column) => [column.id, column])
);

/**
 * Applies a bazza/ui FiltersState to a list of issues, honoring the
 * operator of each filter (is / is not / include / exclude / …).
 */
export function applyIssueFilters(issues: Issue[], filters: FiltersState): Issue[] {
   if (filters.length === 0) return issues;

   return issues.filter((issue) =>
      filters.every((filter) => {
         const column = columnById.get(filter.columnId);
         if (!column) return true;

         const value = column.accessor(issue);
         switch (filter.type) {
            case 'option':
               return optionFilterFn(String(value ?? ''), filter) ?? true;
            case 'multiOption':
               return multiOptionFilterFn((value as string[]) ?? [], filter) ?? true;
            default:
               return true;
         }
      })
   );
}
