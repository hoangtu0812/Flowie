import { FolderKanban, LucideIcon } from 'lucide-react';
import { priorities } from '@/lib/priority-presentations';
import { LiveInitiative, LiveInitiativeProject } from './use-live-initiatives';

export type InitiativeStatus = 'active' | 'planned' | 'completed' | 'canceled';

export const INITIATIVE_STATUS_META: Record<InitiativeStatus, { label: string; color: string }> = {
   active: { label: 'Active', color: '#f2c94c' },
   planned: { label: 'Planned', color: '#95a2b3' },
   completed: { label: 'Completed', color: '#5e6ad2' },
   canceled: { label: 'Canceled', color: '#8f9299' },
};

export const initiativeHealth = [
   { id: 'no-update', name: 'No Update', color: '#8f9299', description: 'No project update yet.' },
   { id: 'off-track', name: 'Off Track', color: '#eb5757', description: 'Project is off track.' },
   { id: 'on-track', name: 'On Track', color: '#4cb782', description: 'Project is on track.' },
   { id: 'at-risk', name: 'At Risk', color: '#f2c94c', description: 'Project may be delayed.' },
] as const;

type UiPriority = (typeof priorities)[number];
type UiHealth = (typeof initiativeHealth)[number];
type ProjectStatusCategory =
   'triage' | 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';

export type InitiativeProject = Omit<
   LiveInitiativeProject,
   'status' | 'priority' | 'health' | 'lead' | 'startDate' | 'targetDate'
> & {
   icon: LucideIcon;
   status: {
      id: string;
      name: string;
      color: string;
      category: ProjectStatusCategory;
      icon: LucideIcon;
   };
   priority: UiPriority;
   health: UiHealth;
   lead: { id: string; name: string; avatarUrl: string };
   teamId: string;
   percentComplete: number;
   startDate: string;
   targetDate?: string;
   labels: [];
};

export type Initiative = Omit<LiveInitiative, 'status' | 'priority' | 'health'> & {
   status: InitiativeStatus;
   priority: UiPriority;
   health: UiHealth;
   target?: string;
   projects: InitiativeProject[];
};

const normalize = (value: string) => value.trim().toLowerCase().replaceAll('_', '-');
const title = (value: string) =>
   normalize(value)
      .split('-')
      .filter(Boolean)
      .map((part) => part[0]?.toUpperCase() + part.slice(1))
      .join(' ');

const statusCategory = (status: string): ProjectStatusCategory => {
   const value = normalize(status);
   if (['completed', 'done'].includes(value)) return 'completed';
   if (['canceled', 'cancelled'].includes(value)) return 'canceled';
   if (value === 'backlog') return 'backlog';
   if (value === 'triage') return 'triage';
   if (['planned', 'todo', 'unstarted'].includes(value)) return 'unstarted';
   return 'started';
};

const initiativeStatus = (status: string): InitiativeStatus => {
   const value = normalize(status);
   if (value === 'planned') return 'planned';
   if (['completed', 'done'].includes(value)) return 'completed';
   if (['canceled', 'cancelled'].includes(value)) return 'canceled';
   return 'active';
};

const priorityView = (priority: string): UiPriority =>
   priorities.find((entry) => entry.id === normalize(priority)) ?? priorities[0];

const healthView = (health: string): UiHealth =>
   initiativeHealth.find((entry) => entry.id === normalize(health)) ?? initiativeHealth[0];

const projectView = (project: LiveInitiativeProject): InitiativeProject => {
   const category = statusCategory(project.status);
   const completedIssues = project.issues.filter(
      (issue) => issue.status.category === 'completed'
   ).length;
   return {
      id: project.id,
      name: project.name,
      identifier: project.identifier,
      targetDate: project.targetDate ?? undefined,
      startDate: project.startDate ?? project.createdAt,
      createdAt: project.createdAt,
      team: project.team,
      issues: project.issues,
      icon: FolderKanban,
      status: {
         id: normalize(project.status),
         name: title(project.status),
         color:
            category === 'completed' ? '#5e6ad2' : category === 'started' ? '#f2c94c' : '#95a2b3',
         category,
         icon: FolderKanban,
      },
      priority: priorityView(project.priority),
      health: healthView(project.health),
      lead: project.lead
         ? { ...project.lead, avatarUrl: project.lead.avatarUrl ?? '' }
         : { id: 'unassigned', name: 'Unassigned', avatarUrl: '' },
      teamId: project.team?.id ?? 'no-team',
      percentComplete:
         project.issues.length > 0
            ? Math.round((completedIssues / project.issues.length) * 100)
            : 0,
      labels: [],
   };
};

export const adaptInitiative = (initiative: LiveInitiative): Initiative => ({
   ...initiative,
   status: initiativeStatus(initiative.status),
   priority: priorityView(initiative.priority),
   health: healthView(initiative.health),
   target: initiative.targetDate
      ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
           new Date(initiative.targetDate)
        )
      : undefined,
   projects: initiative.projectLinks.map((link) => projectView(link.project)),
});

export const adaptInitiatives = (initiatives: LiveInitiative[]) => initiatives.map(adaptInitiative);

export const getInitiativeProjects = (initiative: Initiative) => initiative.projects;

export const countCompletedProjects = (initiative: Initiative) =>
   initiative.projects.filter((project) => project.status.category === 'completed').length;
