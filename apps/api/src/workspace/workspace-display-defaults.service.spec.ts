import { ForbiddenException } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';

describe('WorkspaceService project display defaults', () => {
   const settings = {
      viewTypes: { all: 'list', active: 'timeline' },
      grouping: 'team',
      ordering: 'start-date',
      closedProjects: 'all',
      showEmptyGroups: false,
      showProjectList: true,
      showWeekNumbers: false,
      displayProperties: {
         milestones: false,
         priority: true,
         status: true,
         health: true,
         lead: true,
         members: false,
         targetDate: true,
         issues: true,
         labels: false,
      },
   };

   it('persists defaults and writes an audit record for a manager', async () => {
      const updatedAt = new Date('2026-08-24T10:00:00.000Z');
      const tx = {
         workspace: {
            update: jest.fn().mockResolvedValue({ projectDisplayDefaults: settings, updatedAt }),
         },
         auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
         $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      };
      const service = new WorkspaceService(prisma as never);

      await expect(
         service.updateProjectDisplayDefaults('workspace-1', settings, 'user-1')
      ).resolves.toEqual({ settings, updatedAt });
      expect(tx.workspace.update).toHaveBeenCalledWith(
         expect.objectContaining({ data: { projectDisplayDefaults: settings } })
      );
      expect(tx.auditLog.create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               action: 'workspace.project-display-defaults.updated',
            }),
         })
      );
   });

   it('rejects members without workspace manager access', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const service = new WorkspaceService(prisma as never);

      await expect(
         service.updateProjectDisplayDefaults('workspace-1', settings, 'user-1')
      ).rejects.toBeInstanceOf(ForbiddenException);
   });
});
