'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { createColumnConfigHelper } from '@/components/data-table-filter/core/filters';
import type { ColumnOption, FiltersState } from '@/components/data-table-filter/core/types';
import { multiOptionFilterFn, optionFilterFn } from '@/components/data-table-filter/lib/filter-fns';
import type { Issue } from '@/types/issues';
import type { LabelInterface } from '@/mock-data/labels';
import type { Project } from '@/mock-data/projects';
import type { Status, StatusCategory } from '@/lib/status-presentations';
import type { User } from '@/mock-data/users';
import type { IssueCycleOption } from '@/store/issues-store';
import {
   BarChart3,
   CircleCheck,
   CircleDashed,
   CircleUserRound,
   Folder,
   RefreshCcw,
   Tag,
} from 'lucide-react';

const STATUS_TYPES: { id: StatusCategory; name: string }[] = [
   { id: 'triage', name: 'Triage' },
   { id: 'backlog', name: 'Backlog' },
   { id: 'unstarted', name: 'Unstarted' },
   { id: 'started', name: 'Started' },
   { id: 'completed', name: 'Completed' },
   { id: 'canceled', name: 'Canceled' },
];

const PRIORITIES: Array<{ id: string; name: string }> = [
   { id: 'no-priority', name: 'No priority' },
   { id: 'urgent', name: 'Urgent' },
   { id: 'high', name: 'High' },
   { id: 'medium', name: 'Medium' },
   { id: 'low', name: 'Low' },
];

type IssueFilterSources = {
   statuses: Status[];
   members: User[];
   labels: LabelInterface[];
   projects: Project[];
   cycles: IssueCycleOption[];
};

const dtf = createColumnConfigHelper<Issue>();

export function createIssueFilterColumns({
   statuses,
   members,
   labels,
   projects,
   cycles,
}: IssueFilterSources) {
   const statusOptions: ColumnOption[] = statuses.map((item) => ({
      value: item.id,
      label: item.name,
      icon: <item.icon />,
   }));
   const assigneeOptions: ColumnOption[] = [
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
               <AvatarImage src={user.avatarUrl || undefined} alt={user.name} />
               <AvatarFallback>{user.name[0]}</AvatarFallback>
            </Avatar>
         ),
      })),
   ];
   const labelOptions: ColumnOption[] = labels.map((label) => ({
      value: label.id,
      label: label.name,
      icon: <span className="size-2.5 rounded-full" style={{ backgroundColor: label.color }} />,
   }));
   const projectOptions: ColumnOption[] = projects.map((project) => ({
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
         label: `${cycle.name} (${cycle.status.toLowerCase()})`,
         icon: <RefreshCcw className="size-4 text-muted-foreground" />,
      })),
   ];

   return [
      dtf
         .option()
         .id('status')
         .accessor((issue) => issue.status.id)
         .displayName('Status')
         .icon(CircleCheck)
         .options(statusOptions)
         .build(),
      dtf
         .option()
         .id('statusType')
         .accessor((issue) => issue.status.category)
         .displayName('Status type')
         .icon(CircleDashed)
         .options(
            STATUS_TYPES.map((item) => ({
               value: item.id,
               label: item.name,
               icon: <CircleDashed className="size-4 text-muted-foreground" />,
            }))
         )
         .build(),
      dtf
         .option()
         .id('assignee')
         .accessor((issue) => issue.assignee?.id ?? 'unassigned')
         .displayName('Assignee')
         .icon(CircleUserRound)
         .options(assigneeOptions)
         .build(),
      dtf
         .option()
         .id('priority')
         .accessor((issue) => issue.priority.id)
         .displayName('Priority')
         .icon(BarChart3)
         .options(
            PRIORITIES.map((priority) => ({
               value: priority.id,
               label: priority.name,
               icon: <BarChart3 className="size-4 text-muted-foreground" />,
            }))
         )
         .build(),
      dtf
         .multiOption()
         .id('labels')
         .accessor((issue) => issue.labels.map((label) => label.id))
         .displayName('Labels')
         .icon(Tag)
         .options(labelOptions)
         .build(),
      dtf
         .option()
         .id('project')
         .accessor((issue) => issue.project?.id ?? '')
         .displayName('Project')
         .icon(Folder)
         .options(projectOptions)
         .build(),
      dtf
         .option()
         .id('cycle')
         .accessor((issue) => issue.cycleId || 'no-cycle')
         .displayName('Cycle')
         .icon(RefreshCcw)
         .options(cycleOptions)
         .build(),
   ] as const;
}

export function applyIssueFilters(issues: Issue[], filters: FiltersState): Issue[] {
   if (filters.length === 0) return issues;

   return issues.filter((issue) =>
      filters.every((filter) => {
         const value =
            filter.columnId === 'status'
               ? issue.status.id
               : filter.columnId === 'statusType'
                 ? issue.status.category
                 : filter.columnId === 'assignee'
                   ? (issue.assignee?.id ?? 'unassigned')
                   : filter.columnId === 'priority'
                     ? issue.priority.id
                     : filter.columnId === 'labels'
                       ? issue.labels.map((label) => label.id)
                       : filter.columnId === 'project'
                         ? (issue.project?.id ?? '')
                         : filter.columnId === 'cycle'
                           ? issue.cycleId || 'no-cycle'
                           : undefined;
         if (value === undefined) return true;
         return Array.isArray(value)
            ? (multiOptionFilterFn(value, filter) ?? true)
            : (optionFilterFn(String(value), filter) ?? true);
      })
   );
}
