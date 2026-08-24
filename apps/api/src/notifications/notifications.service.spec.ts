import { BadRequestException, NotFoundException } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

const notification = {
   id: 'notification-1',
   workspaceId: 'workspace-1',
   userId: 'user-1',
   type: 'issue.created',
   entityType: 'issue',
   entityId: 'issue-1',
   data: {},
   readAt: null,
   createdAt: new Date('2026-08-24T10:00:00.000Z'),
};

function createService() {
   const prisma = {
      workspaceMember: {
         findMany: jest.fn().mockResolvedValue([{ userId: 'user-1' }]),
         findFirst: jest.fn().mockResolvedValue({ id: 'membership-1' }),
      },
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      notification: {
         createMany: jest.fn().mockResolvedValue({ count: 1 }),
         findMany: jest.fn().mockResolvedValue([notification]),
         findFirst: jest.fn().mockResolvedValue(notification),
         update: jest.fn().mockResolvedValue({ ...notification, readAt: new Date() }),
         updateMany: jest.fn().mockResolvedValue({ count: 1 }),
         deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      issue: { findMany: jest.fn().mockResolvedValue([]) },
   };
   const jobs = { enqueueDiscord: jest.fn().mockResolvedValue(undefined) };
   return {
      prisma,
      jobs,
      service: new NotificationsService(prisma as never, jobs as never),
   };
}

describe('NotificationsService workspace isolation', () => {
   it('writes workspaceId to every notification created for recipients', async () => {
      const { prisma, service } = createService();

      await service.notifyUsers(
         ['user-1'],
         'workspace-1',
         'actor-1',
         'issue.created',
         'issue',
         'issue-1',
         { title: 'Scoped issue' },
         'Issue created'
      );

      expect(prisma.notification.createMany).toHaveBeenCalledWith({
         data: [
            expect.objectContaining({
               workspaceId: 'workspace-1',
               userId: 'user-1',
               entityId: 'issue-1',
            }),
         ],
      });
      expect(prisma.workspaceMember.findMany).toHaveBeenCalledWith({
         where: {
            workspaceId: 'workspace-1',
            status: 'ACTIVE',
            userId: { in: ['user-1'] },
         },
         select: { userId: true },
      });
   });

   it('lists only the requested workspace after checking active membership', async () => {
      const { prisma, service } = createService();

      await expect(service.list('workspace-1', 'user-1')).resolves.toEqual([notification]);
      expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith({
         where: { workspaceId: 'workspace-1', userId: 'user-1', status: 'ACTIVE' },
         select: { id: true },
      });
      expect(prisma.notification.findMany).toHaveBeenCalledWith({
         where: { workspaceId: 'workspace-1', userId: 'user-1' },
         orderBy: { createdAt: 'desc' },
      });
   });

   it('requires workspaceId instead of falling back to all user notifications', async () => {
      const { prisma, service } = createService();

      await expect(service.list(undefined as never, 'user-1')).rejects.toBeInstanceOf(
         BadRequestException
      );
      expect(prisma.workspaceMember.findFirst).not.toHaveBeenCalled();
      expect(prisma.notification.findMany).not.toHaveBeenCalled();
   });

   it('rejects a user who is not an active member before reading notifications', async () => {
      const { prisma, service } = createService();
      prisma.workspaceMember.findFirst.mockResolvedValue(null);

      await expect(service.list('workspace-2', 'user-1')).rejects.toBeInstanceOf(
         NotFoundException
      );
      expect(prisma.notification.findMany).not.toHaveBeenCalled();
   });

   it('cannot mark a notification from another workspace as read', async () => {
      const { prisma, service } = createService();
      prisma.notification.findFirst.mockResolvedValue(null);

      await expect(
         service.markRead('notification-in-workspace-2', 'workspace-1', 'user-1')
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
         where: {
            id: 'notification-in-workspace-2',
            workspaceId: 'workspace-1',
            userId: 'user-1',
         },
      });
      expect(prisma.notification.update).not.toHaveBeenCalled();
   });

   it('scopes bulk read and delete operations to one workspace', async () => {
      const { prisma, service } = createService();

      await service.markAllRead('workspace-1', 'user-1');
      await service.deleteRead('workspace-1', 'user-1');
      await service.deleteAll('workspace-1', 'user-1');

      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
         where: { workspaceId: 'workspace-1', userId: 'user-1', readAt: null },
         data: { readAt: expect.any(Date) },
      });
      expect(prisma.notification.deleteMany).toHaveBeenNthCalledWith(1, {
         where: { workspaceId: 'workspace-1', userId: 'user-1', readAt: { not: null } },
      });
      expect(prisma.notification.deleteMany).toHaveBeenNthCalledWith(2, {
         where: { workspaceId: 'workspace-1', userId: 'user-1' },
      });
   });

   it('does not inspect completed issues outside the selected workspace', async () => {
      const { prisma, service } = createService();
      prisma.notification.findMany.mockResolvedValue([
         { entityId: 'issue-1' },
         { entityId: 'issue-2' },
      ]);
      prisma.issue.findMany.mockResolvedValue([{ id: 'issue-1' }]);

      await service.deleteForCompletedIssues('workspace-1', 'user-1');

      expect(prisma.notification.findMany).toHaveBeenCalledWith({
         where: { workspaceId: 'workspace-1', userId: 'user-1', entityType: 'issue' },
         select: { entityId: true },
      });
      expect(prisma.issue.findMany).toHaveBeenCalledWith({
         where: {
            workspaceId: 'workspace-1',
            id: { in: ['issue-1', 'issue-2'] },
            status: { category: { in: ['COMPLETED', 'CANCELED'] } },
         },
         select: { id: true },
      });
      expect(prisma.notification.deleteMany).toHaveBeenCalledWith({
         where: {
            workspaceId: 'workspace-1',
            userId: 'user-1',
            entityType: 'issue',
            entityId: { in: ['issue-1'] },
         },
      });
   });
});
