import { PulseService } from './pulse.service';

describe('PulseService', () => {
   it('merges and orders real activities and project updates', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
         activity: {
            findMany: jest.fn().mockResolvedValue([
               {
                  id: 'activity-1',
                  type: 'issue.created',
                  data: {},
                  createdAt: new Date('2026-08-24T09:00:00.000Z'),
                  actor: { id: 'user-1', name: 'An', avatarUrl: null },
                  issue: { id: 'issue-1', identifier: 'OPS-1', title: 'Prepare launch' },
                  project: null,
               },
            ]),
         },
         projectUpdate: {
            findMany: jest.fn().mockResolvedValue([
               {
                  id: 'update-1',
                  body: 'Launch is ready',
                  health: 'on-track',
                  createdAt: new Date('2026-08-24T10:00:00.000Z'),
                  author: { id: 'user-2', name: 'Binh', avatarUrl: null },
                  project: { id: 'project-1', name: 'Launch', identifier: 'LAUNCH' },
               },
            ]),
         },
      };
      const service = new PulseService(prisma as never);

      const result = await service.list('workspace-1', 'user-1', 100);

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
         id: 'project-update:update-1',
         body: 'Launch is ready',
      });
      expect(result[1]).toMatchObject({
         id: 'activity:activity-1',
         title: 'An created an issue',
      });
   });
});
