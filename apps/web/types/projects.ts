import type { Priority } from '@/lib/priority-presentations';
import type { Status } from '@/lib/status-presentations';
import type { LabelInterface } from '@/types/labels';
import type { User } from '@/types/users';
import type { RemixiconComponentType } from '@remixicon/react';
import type { LucideIcon } from 'lucide-react';

export interface Health {
   id: 'no-update' | 'off-track' | 'on-track' | 'at-risk';
   name: string;
   color: string;
   description: string;
}

/** UI shape mapped from the Projects API. It contains no fixture records. */
export interface Project {
   id: string;
   name: string;
   status: Status;
   icon: LucideIcon | RemixiconComponentType;
   percentComplete: number;
   startDate: string;
   targetDate?: string;
   lead: User;
   priority: Priority;
   health: Health;
   teamId: string;
   labels: LabelInterface[];
   initiative?: string;
   healthUpdatedAgoDays?: number;
   isFavorite?: boolean;
}
