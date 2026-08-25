import type { Health } from '@/types/projects';

export const health: Health[] = [
   {
      id: 'no-update',
      name: 'No Update',
      color: '#8f9299',
      description: 'The project has not been updated in the last 30 days.',
   },
   {
      id: 'off-track',
      name: 'Off Track',
      color: '#eb5757',
      description: 'The project is not on track and may be delayed.',
   },
   {
      id: 'on-track',
      name: 'On Track',
      color: '#4cb782',
      description: 'The project is on track and on schedule.',
   },
   {
      id: 'at-risk',
      name: 'At Risk',
      color: '#f2c94c',
      description: 'The project is at risk and may be delayed.',
   },
];
