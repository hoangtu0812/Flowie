import { ForbiddenException } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';

const settings = {
   measure: 'issue-count',
   slice: 'status',
   segment: 'priority',
};

describe('WorkspaceService issue insight defaults', () => {
   it('returns the persisted default to an active workspace member', async () => {
      const updatedAt = new Date('2026-08-24T14:00:00.000Z');
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
         workspace: {
            findUnique: jest.fn().mockResolvedValue({
               issueInsightDefaults: settings,
               updatedAt,
            }),
         },
      };
      const service = new WorkspaceService(prisma as never);

      await expect(service.issueInsightDefaults('workspace-1', 'user-1')).resolves.toEqual({
         settings,
         updatedAt,
      });
      expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith({
         where: { workspaceId: 'workspace-1', userId: 'user-1', status: 'ACTIVE' },
      });
   });

   it('persists the selector state and records the manager action', async () => {
      const updatedAt = new Date('2026-08-24T15:00:00.000Z');
      const tx = {
         workspace: {
            update: jest.fn().mockResolvedValue({
               issueInsightDefaults: settings,
               updatedAt,
            }),
         },
         auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'manager-1' }) },
         $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      };
      const service = new WorkspaceService(prisma as never);

      await expect(
         service.updateIssueInsightDefaults('workspace-1', settings, 'user-1')
      ).resolves.toEqual({ settings, updatedAt });
      expect(prisma.workspaceMember.findFirst).toHaveBeenCalledWith({
         where: {
            workspaceId: 'workspace-1',
            userId: 'user-1',
            status: 'ACTIVE',
            role: { in: ['OWNER', 'ADMIN'] },
         },
      });
      expect(tx.workspace.update).toHaveBeenCalledWith({
         where: { id: 'workspace-1' },
         data: { issueInsightDefaults: settings },
         select: { issueInsightDefaults: true, updatedAt: true },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
         data: {
            workspaceId: 'workspace-1',
            actorId: 'user-1',
            action: 'workspace.issue-insight-defaults.updated',
            entityType: 'workspace',
            entityId: 'workspace-1',
            metadata: {},
         },
      });
   });

   it('rejects a regular member changing defaults for everyone', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const service = new WorkspaceService(prisma as never);

      await expect(
         service.updateIssueInsightDefaults('workspace-1', settings, 'user-1')
      ).rejects.toBeInstanceOf(ForbiddenException);
   });
});
