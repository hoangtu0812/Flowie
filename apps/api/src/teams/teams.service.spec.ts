import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { TeamsService } from './teams.service';

describe('TeamsService membership', () => {
   it('creates the default document folder with a new team', async () => {
      const createdTeam = { id: 'team-1', name: 'Core' };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'manager-1' }) },
         team: { create: jest.fn().mockResolvedValue(createdTeam) },
      };
      const service = new TeamsService(prisma as never);

      await expect(
         service.create({ workspaceId: 'workspace-1', name: 'Core', identifier: 'CORE' }, 'user-1')
      ).resolves.toEqual(createdTeam);
      expect(prisma.team.create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               documentFolders: {
                  create: { workspaceId: 'workspace-1', name: 'Team documents', icon: '📁' },
               },
            }),
         })
      );
   });

   it('lists every active team in an accessible workspace with the current membership truth', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'workspace-member-1' }) },
         team: {
            findMany: jest.fn().mockResolvedValue([
               {
                  id: 'team-joined',
                  members: [{ role: 'MEMBER', user: { id: 'user-1', name: 'Current user' } }],
                  _count: { projects: 1, cycles: 0 },
               },
               {
                  id: 'team-available',
                  members: [{ role: 'LEAD', user: { id: 'user-2', name: 'Another user' } }],
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

   it('lets an active member leave their own team and records an audit event', async () => {
      const tx = {
         teamMember: { delete: jest.fn().mockResolvedValue({}) },
         auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'workspace-member-1' }) },
         teamMember: { findFirst: jest.fn().mockResolvedValue({ role: 'MEMBER' }) },
         $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      };
      const service = new TeamsService(prisma as never);

      await expect(service.leave('team-1', 'workspace-1', 'user-1')).resolves.toEqual({
         teamId: 'team-1',
         userId: 'user-1',
         removed: true,
      });
      expect(tx.teamMember.delete).toHaveBeenCalledWith({
         where: { teamId_userId: { teamId: 'team-1', userId: 'user-1' } },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
         data: expect.objectContaining({
            workspaceId: 'workspace-1',
            actorId: 'user-1',
            action: 'team.member.left',
         }),
      });
   });

   it('does not let a workspace member leave a team they have not joined', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'workspace-member-1' }) },
         teamMember: { findFirst: jest.fn().mockResolvedValue(null) },
         $transaction: jest.fn(),
      };
      const service = new TeamsService(prisma as never);

      await expect(service.leave('team-1', 'workspace-1', 'user-1')).rejects.toBeInstanceOf(
         NotFoundException
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
   });

   it('schedules deletion separately from retirement and records the restore window', async () => {
      const tx = {
         team: { update: jest.fn().mockResolvedValue({ id: 'team-1' }) },
         auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ role: 'ADMIN' }) },
         team: { findFirst: jest.fn().mockResolvedValue({ id: 'team-1' }) },
         $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      };
      const service = new TeamsService(prisma as never);

      await expect(
         service.scheduleDeletion('team-1', 'workspace-1', 'user-1')
      ).resolves.toEqual({ id: 'team-1' });
      expect(tx.team.update).toHaveBeenCalledWith({
         where: { id: 'team-1' },
         data: { archivedAt: expect.any(Date), deletedAt: expect.any(Date) },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
         data: expect.objectContaining({
            action: 'team.deletion_scheduled',
            metadata: { restoreWindowDays: 30 },
         }),
      });
   });

   it('restores a team during the 30-day window and records the audit event', async () => {
      const tx = {
         team: { update: jest.fn().mockResolvedValue({ id: 'team-1' }) },
         auditLog: { create: jest.fn().mockResolvedValue({ id: 'audit-1' }) },
      };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
         team: {
            findFirst: jest.fn().mockResolvedValue({
               id: 'team-1',
               deletedAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
            }),
         },
         $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      };
      const service = new TeamsService(prisma as never);

      await expect(service.restore('team-1', 'workspace-1', 'user-1')).resolves.toEqual({
         id: 'team-1',
      });
      expect(tx.team.update).toHaveBeenCalledWith({
         where: { id: 'team-1' },
         data: { archivedAt: null, deletedAt: null },
      });
      expect(tx.auditLog.create).toHaveBeenCalledWith({
         data: expect.objectContaining({ action: 'team.restored' }),
      });
   });

   it('does not restore a team after the 30-day window', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ role: 'OWNER' }) },
         team: {
            findFirst: jest.fn().mockResolvedValue({
               id: 'team-1',
               deletedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
            }),
         },
         $transaction: jest.fn(),
      };
      const service = new TeamsService(prisma as never);

      await expect(service.restore('team-1', 'workspace-1', 'user-1')).rejects.toThrow(
         'The 30-day restoration window has expired.'
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
   });
});
