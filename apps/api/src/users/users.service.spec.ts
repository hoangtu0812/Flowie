import { ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService workspace profiles', () => {
   const workspaceMember = {
      role: 'MEMBER',
      joinedAt: new Date('2026-01-02T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      workspace: { timezone: 'Asia/Ho_Chi_Minh' },
      user: {
         id: 'member-1',
         name: 'Member One',
         email: 'member@example.com',
         username: 'member.one',
         title: 'Operator',
         avatarUrl: null,
         createdAt: new Date('2025-12-01T00:00:00.000Z'),
         teamMemberships: [
            {
               role: 'MEMBER',
               team: { id: 'team-1', name: 'Operations', identifier: 'OPS', icon: '⚙️' },
            },
         ],
         projectMemberships: [
            { project: { id: 'project-1', name: 'Office move', identifier: 'OFFICE' } },
         ],
      },
   };

   it('returns real team, project, and workspace timezone data for a member profile', async () => {
      const prisma = {
         workspaceMember: {
            findFirst: jest
               .fn()
               .mockResolvedValueOnce({ id: 'caller-membership' })
               .mockResolvedValueOnce(workspaceMember),
         },
      };
      const service = new UsersService(prisma as never);

      await expect(service.get('member-1', 'workspace-1', 'caller-1')).resolves.toEqual(
         expect.objectContaining({
            id: 'member-1',
            timezone: 'Asia/Ho_Chi_Minh',
            projects: [{ id: 'project-1', name: 'Office move', identifier: 'OFFICE' }],
            teams: [
               expect.objectContaining({ id: 'team-1', identifier: 'OPS', role: 'MEMBER' }),
            ],
         })
      );
      expect(prisma.workspaceMember.findFirst).toHaveBeenLastCalledWith(
         expect.objectContaining({
            where: { workspaceId: 'workspace-1', userId: 'member-1', status: 'ACTIVE' },
            include: expect.objectContaining({
               workspace: { select: { timezone: true } },
            }),
         })
      );
   });

   it('does not expose member profiles outside the caller workspace', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue(null) },
      };
      const service = new UsersService(prisma as never);

      await expect(service.get('member-1', 'workspace-1', 'external-user')).rejects.toBeInstanceOf(
         ForbiddenException
      );
      expect(prisma.workspaceMember.findFirst).toHaveBeenCalledTimes(1);
   });
});
