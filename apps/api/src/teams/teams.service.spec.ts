import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';

describe('TeamsService membership', () => {
   it('lists every active team in an accessible workspace with the current membership truth', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'workspace-member-1' }) },
         team: {
            findMany: jest.fn().mockResolvedValue([
               {
                  id: 'team-joined',
                  members: [
                     { role: 'MEMBER', user: { id: 'user-1', name: 'Current user' } },
                  ],
                  _count: { projects: 1, cycles: 0 },
               },
               {
                  id: 'team-available',
                  members: [
                     { role: 'LEAD', user: { id: 'user-2', name: 'Another user' } },
                  ],
                  _count: { projects: 2, cycles: 1 },
               },
            ]),
         },
      };
      const service = new TeamsService(prisma as never);

      const teams = await service.list('workspace-1', 'user-1');

      expect(prisma.team.findMany).toHaveBeenCalledWith(
         expect.objectContaining({ where: { workspaceId: 'workspace-1', archivedAt: null } })
      );
      expect(teams).toEqual([
         expect.objectContaining({ id: 'team-joined', joined: true }),
         expect.objectContaining({ id: 'team-available', joined: false }),
      ]);
   });

   it('does not reveal workspace teams to an inactive or external user', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue(null) },
         team: { findMany: jest.fn() },
      };
      const service = new TeamsService(prisma as never);

      await expect(service.list('workspace-1', 'user-1')).rejects.toBeInstanceOf(
         ForbiddenException
      );
      expect(prisma.team.findMany).not.toHaveBeenCalled();
   });

   it('lets an active workspace member join an active team idempotently', async () => {
      const membership = { teamId: 'team-1', userId: 'user-1', role: 'MEMBER' };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'workspace-member-1' }) },
         team: { findFirst: jest.fn().mockResolvedValue({ id: 'team-1' }) },
         teamMember: { upsert: jest.fn().mockResolvedValue(membership) },
      };
      const service = new TeamsService(prisma as never);

      await expect(service.join('team-1', 'workspace-1', 'user-1')).resolves.toEqual(membership);
      await expect(service.join('team-1', 'workspace-1', 'user-1')).resolves.toEqual(membership);
      expect(prisma.teamMember.upsert).toHaveBeenNthCalledWith(
         1,
         expect.objectContaining({
            where: { teamId_userId: { teamId: 'team-1', userId: 'user-1' } },
            create: { teamId: 'team-1', userId: 'user-1', role: 'MEMBER' },
            update: {},
         })
      );
      expect(prisma.teamMember.upsert).toHaveBeenCalledTimes(2);
   });

   it('does not allow joining an archived, missing, or cross-workspace team', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'workspace-member-1' }) },
         team: { findFirst: jest.fn().mockResolvedValue(null) },
         teamMember: { upsert: jest.fn() },
      };
      const service = new TeamsService(prisma as never);

      await expect(service.join('team-1', 'workspace-1', 'user-1')).rejects.toBeInstanceOf(
         NotFoundException
      );
      expect(prisma.team.findFirst).toHaveBeenCalledWith({
         where: { id: 'team-1', workspaceId: 'workspace-1', archivedAt: null },
         select: { id: true },
      });
      expect(prisma.teamMember.upsert).not.toHaveBeenCalled();
   });
});
