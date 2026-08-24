import { ForbiddenException } from '@nestjs/common';
import { ProjectsService } from './projects.service';

describe('ProjectsService project dates and team assignment', () => {
   const currentProject = {
      id: 'project-1',
      workspaceId: 'workspace-1',
      teamId: null,
   };

   function createService(targetTeam: { id: string } | null = { id: 'team-2' }) {
      const updatedProject = {
         ...currentProject,
         teamId: 'team-2',
         startDate: new Date('2026-08-25T00:00:00.000Z'),
         targetDate: new Date('2026-09-30T00:00:00.000Z'),
      };
      const tx = {
         project: { update: jest.fn().mockResolvedValue(updatedProject) },
         activity: { create: jest.fn().mockResolvedValue({ id: 'activity-1' }) },
      };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'membership-1' }) },
         project: { findFirst: jest.fn().mockResolvedValue(currentProject) },
         team: { findFirst: jest.fn().mockResolvedValue(targetTeam) },
         $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      };
      return { service: new ProjectsService(prisma as never, {} as never), prisma, tx };
   }

   it('persists start, target, and an authorized destination team', async () => {
      const { service, prisma, tx } = createService();
      const update = {
         startDate: '2026-08-25',
         targetDate: '2026-09-30',
         teamId: 'team-2',
      };

      await service.update('project-1', 'workspace-1', update, 'user-1');

      expect(prisma.team.findFirst).toHaveBeenCalledWith({
         where: {
            id: 'team-2',
            workspaceId: 'workspace-1',
            archivedAt: null,
            members: { some: { userId: 'user-1' } },
         },
      });
      expect(tx.project.update).toHaveBeenCalledWith(
         expect.objectContaining({ where: { id: 'project-1' }, data: update })
      );
      expect(tx.activity.create).toHaveBeenCalledWith({
         data: expect.objectContaining({
            workspaceId: 'workspace-1',
            projectId: 'project-1',
            actorId: 'user-1',
            type: 'project.updated',
            data: update,
         }),
      });
   });

   it('allows clearing dates and the team without resolving a destination team', async () => {
      const { service, prisma, tx } = createService();
      const update = { startDate: null, targetDate: null, teamId: null };

      await service.update('project-1', 'workspace-1', update, 'user-1');

      expect(prisma.team.findFirst).not.toHaveBeenCalled();
      expect(tx.project.update).toHaveBeenCalledWith(
         expect.objectContaining({ data: update })
      );
   });

   it('rejects assigning a project to a team the caller cannot access', async () => {
      const { service, prisma } = createService(null);

      await expect(
         service.update(
            'project-1',
            'workspace-1',
            { teamId: 'restricted-team' },
            'user-1'
         )
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
   });
});
