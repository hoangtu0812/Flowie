import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ProjectsService } from './projects.service';

describe('ProjectsService members', () => {
   const project = {
      id: 'project-1',
      workspaceId: 'workspace-1',
      teamId: null,
      members: [],
   };

   it('replaces members with active workspace users and records the change', async () => {
      const savedMembers = [
         {
            projectId: 'project-1',
            userId: 'member-1',
            user: { id: 'member-1', name: 'Member One', avatarUrl: null },
         },
      ];
      const tx = {
         projectMember: {
            deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
            createMany: jest.fn().mockResolvedValue({ count: 1 }),
            findMany: jest.fn().mockResolvedValue(savedMembers),
         },
         activity: { create: jest.fn().mockResolvedValue({ id: 'activity-1' }) },
      };
      const prisma = {
         workspaceMember: {
            findFirst: jest.fn().mockResolvedValue({ id: 'caller-membership' }),
            findMany: jest.fn().mockResolvedValue([{ userId: 'member-1' }]),
         },
         project: { findFirst: jest.fn().mockResolvedValue(project) },
         $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
      };
      const service = new ProjectsService(prisma as never, {} as never);

      await expect(
         service.updateMembers('project-1', 'workspace-1', ['member-1'], 'user-1')
      ).resolves.toEqual(savedMembers);
      expect(tx.projectMember.deleteMany).toHaveBeenCalledWith({
         where: { projectId: 'project-1' },
      });
      expect(tx.projectMember.createMany).toHaveBeenCalledWith({
         data: [{ projectId: 'project-1', userId: 'member-1' }],
      });
      expect(tx.activity.create).toHaveBeenCalledWith({
         data: expect.objectContaining({
            workspaceId: 'workspace-1',
            projectId: 'project-1',
            actorId: 'user-1',
            type: 'project.members.updated',
            data: { memberIds: ['member-1'] },
         }),
      });
   });

   it('rejects users who are not active members of the same workspace', async () => {
      const prisma = {
         workspaceMember: {
            findFirst: jest.fn().mockResolvedValue({ id: 'caller-membership' }),
            findMany: jest.fn().mockResolvedValue([]),
         },
         project: { findFirst: jest.fn().mockResolvedValue(project) },
         $transaction: jest.fn(),
      };
      const service = new ProjectsService(prisma as never, {} as never);

      await expect(
         service.updateMembers('project-1', 'workspace-1', ['external-user'], 'user-1')
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
   });

   it('checks caller workspace access before reading or changing project members', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn() },
         project: { findFirst: jest.fn() },
         $transaction: jest.fn(),
      };
      const service = new ProjectsService(prisma as never, {} as never);

      await expect(
         service.updateMembers('project-1', 'workspace-1', [], 'external-user')
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.project.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
   });
});
