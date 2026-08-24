import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';

function createService() {
   const tx = {
      auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      teamMember: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
      workspaceMember: { delete: jest.fn().mockResolvedValue({ id: 'membership-1' }) },
   };
   const prisma = {
      workspaceMember: {
         findFirst: jest.fn().mockResolvedValue({
            id: 'membership-1',
            workspaceId: 'workspace-1',
            userId: 'user-1',
            role: 'MEMBER',
            status: 'ACTIVE',
         }),
      },
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
   };

   return { prisma, service: new WorkspaceService(prisma as never), tx };
}

describe('WorkspaceService membership lifecycle', () => {
   it('lets an active non-owner remove their own membership atomically', async () => {
      const { prisma, service, tx } = createService();

      await expect(service.leave('workspace-1', 'user-1')).resolves.toEqual({
         id: 'membership-1',
         left: true,
      });

      expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith({
         where: { workspaceId: 'workspace-1', userId: 'user-1', status: 'ACTIVE' },
         select: { id: true, role: true },
      });
      expect(tx.teamMember.deleteMany).toHaveBeenCalledWith({
         where: { userId: 'user-1', team: { workspaceId: 'workspace-1' } },
      });
      expect(tx.workspaceMember.delete).toHaveBeenCalledWith({
         where: { id: 'membership-1' },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
         data: {
            workspaceId: 'workspace-1',
            actorId: 'user-1',
            action: 'workspace.member.left',
            entityType: 'workspace-member',
            entityId: 'membership-1',
            metadata: {},
         },
      });
   });

   it('does not let the workspace owner leave without transferring ownership', async () => {
      const { prisma, service, tx } = createService();
      prisma.workspaceMember.findFirst.mockResolvedValue({
         id: 'owner-membership',
         role: 'OWNER',
      });

      await expect(service.leave('workspace-1', 'user-1')).rejects.toBeInstanceOf(
         ForbiddenException
      );
      expect(tx.workspaceMember.delete).not.toHaveBeenCalled();
   });

   it('does not reveal workspaces where the caller is not an active member', async () => {
      const { prisma, service, tx } = createService();
      prisma.workspaceMember.findFirst.mockResolvedValue(null);

      await expect(service.leave('workspace-2', 'user-1')).rejects.toBeInstanceOf(
         NotFoundException
      );
      expect(tx.workspaceMember.delete).not.toHaveBeenCalled();
   });
});
