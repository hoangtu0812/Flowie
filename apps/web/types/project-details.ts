import type { ContentBlock } from '@circle/contracts';
import type { User } from '@/types/users';

export interface ProjectMilestone {
   id: string;
   name: string;
   targetDate?: string;
   completed: boolean;
}

export type ProjectUpdateHealth = 'on-track' | 'at-risk' | 'off-track';

export const projectUpdateHealthLabel: Record<ProjectUpdateHealth, string> = {
   'on-track': 'On track',
   'at-risk': 'At risk',
   'off-track': 'Off track',
};

export const projectUpdateHealthColor: Record<ProjectUpdateHealth, string> = {
   'on-track': '#4cb782',
   'at-risk': '#f2c94c',
   'off-track': '#eb5757',
};

export interface ProjectUpdate {
   id: string;
   author: User;
   date: string;
   health: ProjectUpdateHealth;
   blocks: ContentBlock[];
   attachments?: Array<{ id: string; filename: string; mimeType: string; size: number }>;
}

export interface ProjectActivityEvent {
   id: string;
   user: User;
   date: string;
   text: string;
}

export interface ProjectResource {
   label: string;
   url: string;
}

export interface ProjectDetail {
   projectId: string;
   summary: string;
   description: ContentBlock[];
   resources: ProjectResource[];
   milestones: ProjectMilestone[];
   updates: ProjectUpdate[];
   activity: ProjectActivityEvent[];
}
