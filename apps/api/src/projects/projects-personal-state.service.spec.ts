import { ProjectsService } from './projects.service';

describe('ProjectsService personal state', () => {
   it('persists a favorite only after workspace and team authorization', async () => {
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
         team: { findFirst: jest.fn().mockResolvedValue({ id: 'team-1' }) },
         project: {
            findFirst: jest.fn().mockResolvedValue({
               id: 'project-1',
               workspaceId: 'workspace-1',
               teamId: 'team-1',
            }),
         },
         projectFavorite: {
            upsert: jest.fn().mockResolvedValue({
               projectId: 'project-1',
               userId: 'user-1',
               createdAt: new Date('2026-08-24T10:00:00.000Z'),
            }),
         },
      };
      const service = new ProjectsService(prisma as never, {} as never);

      await expect(
         service.favorite('project-1', 'workspace-1', 'user-1')
      ).resolves.toMatchObject({ favorite: true });
      expect(prisma.projectFavorite.upsert).toHaveBeenCalledWith(
         expect.objectContaining({
            create: { projectId: 'project-1', userId: 'user-1' },
         })
      );
   });
});
