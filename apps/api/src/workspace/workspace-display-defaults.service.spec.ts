import { ForbiddenException } from '@nestjs/common';
import { WorkspaceService } from './workspace.service';

describe('WorkspaceService display defaults', () => {
   const projectSettings = {
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
   const issueSettings = {
      viewType: 'grid',
      grouping: 'assignee',
      ordering: 'created',
      orderCompletedByRecency: true,
      completedIssues: 'none',
      showSubIssues: false,
      showEmptyGroups: true,
      displayProperties: {
         id: true,
         status: true,
         priority: false,
         assignee: true,
         labels: false,
         project: true,
         dueDate: true,
         created: true,
         cycle: true,
      },
   };

   it('persists defaults and writes an audit record for a manager', async () => {
      const updatedAt = new Date('2026-08-24T10:00:00.000Z');
      const tx = {
         workspace: {
            update: jest
               .fn()
               .mockResolvedValue({ projectDisplayDefaults: projectSettings, updatedAt }),
         },
         auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
         $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      };
      const service = new WorkspaceService(prisma as never);

      await expect(
         service.updateProjectDisplayDefaults('workspace-1', projectSettings, 'user-1')
      ).resolves.toEqual({ settings: projectSettings, updatedAt });
      expect(tx.workspace.update).toHaveBeenCalledWith(
         expect.objectContaining({ data: { projectDisplayDefaults: projectSettings } })
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
         service.updateProjectDisplayDefaults('workspace-1', projectSettings, 'user-1')
      ).rejects.toBeInstanceOf(ForbiddenException);
   });

   it('persists issue defaults and writes an audit record for a manager', async () => {
      const updatedAt = new Date('2026-08-24T11:00:00.000Z');
      const tx = {
         workspace: {
            update: jest.fn().mockResolvedValue({
               issueDisplayDefaults: issueSettings,
               updatedAt,
            }),
         },
         auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-2' }) },
      };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
         $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      };
      const service = new WorkspaceService(prisma as never);

      await expect(
         service.updateIssueDisplayDefaults('workspace-1', issueSettings, 'user-1')
      ).resolves.toEqual({ settings: issueSettings, updatedAt });
      expect(tx.workspace.update).toHaveBeenCalledWith(
         expect.objectContaining({ data: { issueDisplayDefaults: issueSettings } })
      );
      expect(tx.auditLog.create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               action: 'workspace.issue-display-defaults.updated',
            }),
         })
      );
   });

   it('rejects issue defaults from members without manager access', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const service = new WorkspaceService(prisma as never);

      await expect(
         service.updateIssueDisplayDefaults('workspace-1', issueSettings, 'user-1')
      ).rejects.toBeInstanceOf(ForbiddenException);
   });
});
