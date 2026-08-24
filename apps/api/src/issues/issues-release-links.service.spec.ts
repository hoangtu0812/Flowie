import { NotFoundException } from '@nestjs/common';
import { IssuesService } from './issues.service';

describe('IssuesService release links', () => {
   const issue = { id: 'issue-1', workspaceId: 'workspace-1', teamId: 'team-1' };

   const createService = (releaseCount: number) => {
      const tx = {
         issue: { update: jest.fn().mockResolvedValue({ ...issue, releaseLinks: [] }) },
         activity: { create: jest.fn().mockResolvedValue({ id: 'activity-1' }) },
      };
      const prisma = {
         release: { count: jest.fn().mockResolvedValue(releaseCount) },
         $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      };
      const service = new IssuesService(prisma as never, {} as never, {} as never, {} as never);
      jest.spyOn(service, 'get').mockResolvedValue(issue as never);
      return { service, prisma, tx };
   };

   it('replaces release links atomically with unique workspace releases', async () => {
      const { service, prisma, tx } = createService(2);

      await service.update(
         'issue-1',
         'workspace-1',
         { releaseIds: ['release-1', 'release-2', 'release-1'] },
         'user-1'
      );

      expect(prisma.release.count).toHaveBeenCalledWith({
         where: {
            workspaceId: 'workspace-1',
            archivedAt: null,
            id: { in: ['release-1', 'release-2'] },
         },
      });
      expect(tx.issue.update).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               releaseLinks: {
                  deleteMany: {},
                  create: [{ releaseId: 'release-1' }, { releaseId: 'release-2' }],
               },
            }),
         })
      );
   });

   it('rejects a release outside the current workspace', async () => {
      const { service, prisma } = createService(1);

      await expect(
         service.update(
            'issue-1',
            'workspace-1',
            { releaseIds: ['release-1', 'release-other'] },
            'user-1'
         )
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
   });
});
