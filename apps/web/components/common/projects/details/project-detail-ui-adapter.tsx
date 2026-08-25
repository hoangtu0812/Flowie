'use client';

import type { ContentBlock } from '@circle/contracts';
import type { Issue } from '@/types/issues';
import { priorities } from '@/lib/priority-presentations';
import { health as projectHealth } from '@/lib/project-presentations';
import type { Project } from '@/types/projects';
import type { ProjectDetail, ProjectUpdateHealth } from '@/types/project-details';
import { status as circleStatuses, type Status, type StatusCategory } from '@/lib/status-presentations';
import type { User } from '@/types/users';
import { Circle, CircleCheck, CircleDashed, CirclePlay, CircleX, FolderKanban } from 'lucide-react';
import { createElement } from 'react';
import type {
   LiveActivity,
   LiveMilestone,
   LiveProject,
   LiveProjectIssue,
   LiveProjectUpdate,
} from './use-live-project';

export type ProjectDetailUiProject = Project & {
   team?: { id: string; name: string; identifier: string; icon: string | null } | null;
   persistedStartDate: string | null;
   members: LiveProject['members'];
};

export type ProjectDetailUiIssue = Issue & { cycleName?: string };

const titleCase = (value: string) =>
   value
      .trim()
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, (character) => character.toUpperCase());

const statusCategory = (value: string): StatusCategory => {
   const normalized = value.trim().toLowerCase().replace(/_/g, '-');
   if (normalized === 'completed' || normalized === 'done') return 'completed';
   if (normalized === 'canceled' || normalized === 'cancelled') return 'canceled';
   if (normalized === 'started' || normalized === 'in-progress' || normalized === 'active')
      return 'started';
   if (normalized === 'backlog') return 'backlog';
   if (normalized === 'triage') return 'triage';
   return 'unstarted';
};

export const projectStatusPresentation = (name: string, category?: string): Status => {
   const normalizedName = name.trim().toLowerCase().replace(/[ _]+/g, '-');
   const circleStatus = circleStatuses.find(
      (item) => item.id === normalizedName || item.name.toLowerCase() === name.trim().toLowerCase()
   );
   if (circleStatus) return { ...circleStatus, id: name };
   const mappedCategory = statusCategory(category ?? name);
   const Icon =
      mappedCategory === 'completed'
         ? CircleCheck
         : mappedCategory === 'canceled'
           ? CircleX
           : mappedCategory === 'started'
             ? CirclePlay
             : mappedCategory === 'backlog' || mappedCategory === 'triage'
               ? CircleDashed
               : Circle;
   const color =
      mappedCategory === 'completed'
         ? '#5e6ad2'
         : mappedCategory === 'canceled'
           ? '#95a2b3'
           : mappedCategory === 'started'
             ? '#facc15'
             : '#99a2b2';
   return {
      id: name,
      name: titleCase(name),
      color,
      category: mappedCategory,
      icon: () => createElement(Icon, { className: 'size-4' }),
   };
};

const memberPresentation = (
   member: { id: string; name: string; avatarUrl: string | null } | null,
   createdAt: string
): User => ({
   id: member?.id ?? 'unassigned',
   name: member?.name ?? 'Unassigned',
   avatarUrl: member?.avatarUrl ?? '',
   email: '',
   status: 'offline',
   role: 'Member',
   joinedDate: createdAt,
   teamIds: [],
   timezone: 'UTC',
});

const descriptionBlocks = (description: string | null): ContentBlock[] => {
   if (!description?.trim()) return [];
   const lines = description.split(/\r?\n/);
   const blocks: ContentBlock[] = [];
   let bullets: string[] = [];
   const flushBullets = () => {
      if (bullets.length) blocks.push({ type: 'bullet-list', items: bullets });
      bullets = [];
   };
   for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) {
         flushBullets();
         continue;
      }
      const heading = /^(#{1,3})\s+(.+)$/.exec(line);
      if (heading) {
         flushBullets();
         blocks.push({
            type: 'heading',
            text: heading[2],
            level: heading[1].length > 1 ? 2 : 1,
         });
      } else if (/^[-*]\s+/.test(line)) {
         bullets.push(line.replace(/^[-*]\s+/, ''));
      } else if (line.startsWith('> ')) {
         flushBullets();
         blocks.push({ type: 'quote', text: line.slice(2) });
      } else {
         flushBullets();
         blocks.push({ type: 'paragraph', text: line });
      }
   }
   flushBullets();
   return blocks;
};

const updateHealth = (value: string | null | undefined): ProjectUpdateHealth =>
   value === 'at-risk' || value === 'off-track' ? value : 'on-track';

const activityText = (activity: LiveActivity) => {
   switch (activity.type) {
      case 'project.created':
         return 'created the project';
      case 'project.updated':
         return 'updated project properties';
      case 'project.update.created':
         return 'posted a project update';
      case 'project.resource.created':
         return 'added a project resource';
      case 'project.archived':
         return 'archived the project';
      case 'project.restored':
         return 'restored the project';
      default:
         return activity.type.replaceAll('.', ' ');
   }
};

export function toProjectUi(
   project: LiveProject,
   issues: LiveProjectIssue[]
): ProjectDetailUiProject {
   const completed = issues.filter(
      (issue) => statusCategory(issue.status.category) === 'completed'
   ).length;
   return {
      id: project.id,
      name: project.name,
      status: projectStatusPresentation(project.status),
      icon: FolderKanban,
      percentComplete: issues.length ? Math.round((completed / issues.length) * 100) : 0,
      startDate: project.startDate ?? project.createdAt,
      persistedStartDate: project.startDate,
      targetDate: project.targetDate ?? undefined,
      lead: memberPresentation(project.lead, project.createdAt),
      priority:
         priorities.find(
            (priority) =>
               priority.id === (project.priority === 'none' ? 'no-priority' : project.priority)
         ) ?? priorities[0],
      health: projectHealth.find((health) => health.id === project.health) ?? projectHealth[0],
      teamId: project.team?.id ?? '',
      team: project.team,
      members: project.members,
      labels: project.labelLinks.map((link) => link.label),
      initiative: project.initiativeLinks[0]?.initiative.name,
   };
}

export function toIssueUi(
   issue: LiveProjectIssue,
   project: ProjectDetailUiProject
): ProjectDetailUiIssue {
   return {
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      description: issue.description ?? '',
      status: projectStatusPresentation(issue.status.name, issue.status.category),
      assignee: issue.assignee ? memberPresentation(issue.assignee, issue.createdAt) : null,
      creator: issue.creator ? memberPresentation(issue.creator, issue.createdAt) : undefined,
      priority:
         priorities.find(
            (priority) =>
               priority.id === (issue.priority === 'none' ? 'no-priority' : issue.priority)
         ) ?? priorities[0],
      labels: issue.labelLinks.map((link) => link.label),
      createdAt: issue.createdAt,
      team: issue.team,
      cycleId: issue.cycleLinks[0]?.cycle.id ?? '',
      cycleName: issue.cycleLinks[0]?.cycle.name,
      project,
      rank: issue.rank,
      dueDate: issue.dueDate ?? undefined,
   };
}

export function toProjectDetailUi(
   project: LiveProject,
   milestones: LiveMilestone[],
   updates: LiveProjectUpdate[],
   activities: LiveActivity[]
): ProjectDetail {
   const fallbackAuthor = memberPresentation(project.lead, project.createdAt);
   return {
      projectId: project.id,
      summary: project.description?.split(/\r?\n/).find((line) => line.trim()) ?? '',
      description: descriptionBlocks(project.description),
      resources: project.resources.map((resource) => ({
         label: resource.label,
         url: resource.url,
      })),
      milestones: milestones.map((milestone) => ({
         id: milestone.id,
         name: milestone.title,
         targetDate: milestone.targetDate ?? undefined,
         completed: Boolean(milestone.completedAt),
      })),
      updates: updates.map((update) => ({
         id: update.id,
         author: memberPresentation(update.author, update.createdAt),
         date: update.createdAt,
         health: updateHealth(update.health ?? project.health),
         blocks: descriptionBlocks(update.body),
         attachments: update.attachments ?? [],
      })),
      activity: activities.map((activity) => ({
         id: activity.id,
         user: activity.actor
            ? memberPresentation(activity.actor, activity.createdAt)
            : fallbackAuthor,
         date: activity.createdAt,
         text: activityText(activity),
      })),
   };
}
