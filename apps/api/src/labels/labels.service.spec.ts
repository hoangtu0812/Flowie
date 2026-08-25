import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { LabelsService } from './labels.service';

describe('LabelsService', () => {
   const prisma = {
      workspaceMember: { findFirst: jest.fn() },
      label: {
         findMany: jest.fn(),
         findFirst: jest.fn(),
         create: jest.fn(),
         update: jest.fn(),
         delete: jest.fn(),
      },
      labelGroup: {
         findMany: jest.fn(),
         findFirst: jest.fn(),
         create: jest.fn(),
         update: jest.fn(),
         delete: jest.fn(),
      },
   };
   const service = new LabelsService(prisma as never);

   beforeEach(() => {
      jest.clearAllMocks();
   });

   it('lists persisted groups for active workspace members', async () => {
      const groups = [{ id: 'group-1', name: 'Customer' }];
      prisma.workspaceMember.findFirst.mockResolvedValue({ id: 'membership-1' });
      prisma.labelGroup.findMany.mockResolvedValue(groups);

      await expect(service.listGroups('workspace-1', 'user-1')).resolves.toEqual(groups);
      expect(prisma.labelGroup.findMany).toHaveBeenCalledWith({
         where: { workspaceId: 'workspace-1' },
         include: { _count: { select: { labels: true } } },
         orderBy: { name: 'asc' },
      });
   });

   it('requires workspace administrator access to create a group', async () => {
      prisma.workspaceMember.findFirst.mockResolvedValue(null);

      await expect(
         service.createGroup(
            { workspaceId: 'workspace-1', name: 'Customer', description: ' Customer work ' },
            'user-1'
         )
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.labelGroup.create).not.toHaveBeenCalled();
   });

   it('creates a normalized group for workspace administrators', async () => {
      const group = { id: 'group-1', name: 'Customer' };
      prisma.workspaceMember.findFirst.mockResolvedValue({ id: 'membership-1', role: 'ADMIN' });
      prisma.labelGroup.create.mockResolvedValue(group);

      await expect(
         service.createGroup(
            { workspaceId: 'workspace-1', name: ' Customer ', description: ' Customer work ' },
            'user-1'
         )
      ).resolves.toEqual(group);
      expect(prisma.labelGroup.create).toHaveBeenCalledWith({
         data: {
            workspaceId: 'workspace-1',
            name: 'Customer',
            description: 'Customer work',
         },
         include: { _count: { select: { labels: true } } },
      });
   });

   it('does not assign a label to a group from another workspace', async () => {
      prisma.workspaceMember.findFirst.mockResolvedValue({ id: 'membership-1', role: 'ADMIN' });
      prisma.label.findFirst.mockResolvedValue({ id: 'label-1', workspaceId: 'workspace-1' });
      prisma.labelGroup.findFirst.mockResolvedValue(null);

      await expect(
         service.update('label-1', 'workspace-1', { groupId: 'group-2' }, 'user-1')
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.label.update).not.toHaveBeenCalled();
   });

   it('updates a group only after resolving it inside the workspace', async () => {
      const group = { id: 'group-1', workspaceId: 'workspace-1' };
      prisma.workspaceMember.findFirst.mockResolvedValue({ id: 'membership-1', role: 'OWNER' });
      prisma.labelGroup.findFirst.mockResolvedValue(group);
      prisma.labelGroup.update.mockResolvedValue({ ...group, name: 'Operations' });

      await service.updateGroup(
         'group-1',
         'workspace-1',
         { name: ' Operations ', description: null },
         'user-1'
      );
      expect(prisma.labelGroup.findFirst).toHaveBeenCalledWith({
         where: { id: 'group-1', workspaceId: 'workspace-1' },
      });
      expect(prisma.labelGroup.update).toHaveBeenCalledWith({
         where: { id: 'group-1' },
         data: { name: 'Operations', description: null },
         include: { _count: { select: { labels: true } } },
      });
   });

   it('deletes the group while leaving its labels to the database SetNull relation', async () => {
      prisma.workspaceMember.findFirst.mockResolvedValue({ id: 'membership-1', role: 'ADMIN' });
      prisma.labelGroup.findFirst.mockResolvedValue({ id: 'group-1' });
      prisma.labelGroup.delete.mockResolvedValue({ id: 'group-1' });

      await expect(service.removeGroup('group-1', 'workspace-1', 'user-1')).resolves.toEqual({
         id: 'group-1',
         deleted: true,
      });
      expect(prisma.labelGroup.delete).toHaveBeenCalledWith({ where: { id: 'group-1' } });
   });
});
