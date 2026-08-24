import { ProjectsService } from './projects.service';

describe('ProjectsService resources', () => {
   it('persists a project resource after workspace and project authorization', async () => {
      const resource = {
         id: 'resource-1',
         label: 'Project brief',
         url: 'https://example.com/brief',
      };
      const tx = {
         projectResource: { create: jest.fn().mockResolvedValue(resource) },
         activity: { create: jest.fn().mockResolvedValue({ id: 'activity-1' }) },
      };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
         project: {
            findFirst: jest.fn().mockResolvedValue({
               id: 'project-1',
               workspaceId: 'workspace-1',
               teamId: null,
            }),
         },
         $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      };
      const service = new ProjectsService(prisma as never, {} as never);

      await expect(
         service.createResource(
            'project-1',
            {
               workspaceId: 'workspace-1',
               label: ' Project brief ',
               url: 'https://example.com/brief',
            },
            'user-1'
         )
      ).resolves.toEqual(resource);

      expect(tx.projectResource.create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: {
               workspaceId: 'workspace-1',
               projectId: 'project-1',
               createdById: 'user-1',
               label: 'Project brief',
               url: 'https://example.com/brief',
            },
         })
      );
      expect(tx.activity.create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               projectId: 'project-1',
               type: 'project.resource.created',
            }),
         })
      );
   });
});
