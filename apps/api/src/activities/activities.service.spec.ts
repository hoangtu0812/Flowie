import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { ActivitiesService } from './activities.service';

describe('ActivitiesService', () => {
   const prisma = {
      workspaceMember: { findFirst: jest.fn() },
      issue: { findFirst: jest.fn() },
      project: { findFirst: jest.fn() },
      team: { findFirst: jest.fn() },
      activity: { findMany: jest.fn() },
   };
   const service = new ActivitiesService(prisma as never);

   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('returns the stored JSON payload for an authorized issue activity feed', async () => {
      const createdAt = new Date('2026-08-24T00:00:00.000Z');
      const data = { relatedIdentifier: 'CORE-42' };
      const actor = { id: 'user-1', name: 'Ada', avatarUrl: null };
      prisma.workspaceMember.findFirst.mockResolvedValue({ id: 'membership-1' });
      prisma.issue.findFirst.mockResolvedValue({ id: 'issue-1', teamId: 'team-1' });
      prisma.team.findFirst.mockResolvedValue({ id: 'team-1' });
      prisma.activity.findMany.mockResolvedValue([
         { id: 'activity-1', type: 'issue.related', data, createdAt, actor },
      ]);

      await expect(service.list('workspace-1', 'user-1', 'issue-1')).resolves.toEqual([
         { id: 'activity-1', type: 'issue.related', data, createdAt, actor },
      ]);
      expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith({
         where: { workspaceId: 'workspace-1', userId: 'user-1', status: 'ACTIVE' },
      });
      expect(prisma.issue.findFirst).toHaveBeenCalledWith({
         where: { id: 'issue-1', workspaceId: 'workspace-1', archivedAt: null },
      });
      expect(prisma.team.findFirst).toHaveBeenCalledWith({
         where: {
            id: 'team-1',
            workspaceId: 'workspace-1',
            members: { some: { userId: 'user-1' } },
         },
      });
      expect(prisma.activity.findMany).toHaveBeenCalledWith(
         expect.objectContaining({ where: { workspaceId: 'workspace-1', issueId: 'issue-1' } })
      );
   });

   it('rejects users without an active workspace membership before loading the target', async () => {
      prisma.workspaceMember.findFirst.mockResolvedValue(null);

      await expect(service.list('workspace-1', 'user-1', 'issue-1')).rejects.toBeInstanceOf(
         ForbiddenException
      );
      expect(prisma.issue.findFirst).not.toHaveBeenCalled();
      expect(prisma.activity.findMany).not.toHaveBeenCalled();
   });

   it('does not authorize an issue from another workspace', async () => {
      prisma.workspaceMember.findFirst.mockResolvedValue({ id: 'membership-1' });
      prisma.issue.findFirst.mockResolvedValue(null);

      await expect(service.list('workspace-1', 'user-1', 'issue-2')).rejects.toBeInstanceOf(
         NotFoundException
      );
      expect(prisma.issue.findFirst).toHaveBeenCalledWith({
         where: { id: 'issue-2', workspaceId: 'workspace-1', archivedAt: null },
      });
      expect(prisma.team.findFirst).not.toHaveBeenCalled();
      expect(prisma.activity.findMany).not.toHaveBeenCalled();
   });

   it('rejects workspace members who do not belong to the issue team', async () => {
      prisma.workspaceMember.findFirst.mockResolvedValue({ id: 'membership-1' });
      prisma.issue.findFirst.mockResolvedValue({ id: 'issue-1', teamId: 'team-1' });
      prisma.team.findFirst.mockResolvedValue(null);

      await expect(service.list('workspace-1', 'user-1', 'issue-1')).rejects.toBeInstanceOf(
         ForbiddenException
      );
      expect(prisma.activity.findMany).not.toHaveBeenCalled();
   });
});
