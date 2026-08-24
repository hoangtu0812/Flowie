import { ForbiddenException } from '@nestjs/common';
import { CommentsService } from './comments.service';

describe('CommentsService archived team access', () => {
   function createService() {
      const prisma = {
         issue: {
            findFirst: jest.fn().mockResolvedValue({ teamId: 'team-1' }),
         },
         workspaceMember: {
            findFirst: jest.fn().mockResolvedValue({ id: 'workspace-member-1' }),
         },
         team: {
            // An archived team does not match the active-team guard.
            findFirst: jest.fn().mockResolvedValue(null),
         },
         comment: {
            findMany: jest.fn(),
         },
         attachment: {
            findMany: jest.fn(),
         },
         $transaction: jest.fn(),
      };
      return { service: new CommentsService(prisma as never), prisma };
   }

   it('does not list comments for an issue in an archived team', async () => {
      const { service, prisma } = createService();

      await expect(service.list('workspace-1', 'issue-1', 'user-1')).rejects.toBeInstanceOf(
         ForbiddenException
      );
      expect(prisma.team.findFirst).toHaveBeenCalledWith({
         where: {
            id: 'team-1',
            workspaceId: 'workspace-1',
            archivedAt: null,
            members: { some: { userId: 'user-1' } },
         },
      });
      expect(prisma.comment.findMany).not.toHaveBeenCalled();
   });

   it('does not create comments for an issue in an archived team', async () => {
      const { service, prisma } = createService();

      await expect(
         service.create(
            { workspaceId: 'workspace-1', issueId: 'issue-1', content: 'Blocked write' },
            'user-1'
         )
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
   });
});
