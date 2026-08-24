import { WorkspaceService } from './workspace.service';

describe('WorkspaceService create', () => {
   it('creates an owned workspace with a navigable slug and default team', async () => {
      const created = {
         id: 'organization-1',
         name: 'Product Operations',
         slug: 'product-operations',
         workspaces: [
            {
               id: 'workspace-1',
               name: 'Product Operations',
               slug: 'product-operations',
               members: [{ userId: 'user-1', status: 'ACTIVE', role: 'OWNER' }],
            },
         ],
      };
      const prisma = {
         workspace: { findUnique: jest.fn().mockResolvedValue(null) },
         organization: { create: jest.fn().mockResolvedValue(created) },
      };
      const service = new WorkspaceService(prisma as never);

      await expect(service.create({ name: '  Product Operations  ' }, 'user-1')).resolves.toEqual(
         created
      );
      expect(prisma.organization.create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               name: 'Product Operations',
               slug: 'product-operations',
               ownerId: 'user-1',
               workspaces: {
                  create: expect.objectContaining({
                     name: 'Product Operations',
                     slug: 'product-operations',
                     members: {
                        create: expect.objectContaining({
                           userId: 'user-1',
                           status: 'ACTIVE',
                           role: 'OWNER',
                        }),
                     },
                     teams: {
                        create: expect.objectContaining({
                           name: 'General',
                           identifier: 'GEN',
                           members: { create: { userId: 'user-1', role: 'LEAD' } },
                        }),
                     },
                  }),
               },
            }),
            include: { workspaces: { include: { members: { include: { user: true } } } } },
         })
      );
   });

   it('uses the next available slug when the normalized name already exists', async () => {
      const prisma = {
         workspace: {
            findUnique: jest
               .fn()
               .mockResolvedValueOnce({ id: 'workspace-1' })
               .mockResolvedValueOnce({ id: 'workspace-2' })
               .mockResolvedValueOnce(null),
         },
         organization: {
            create: jest.fn().mockImplementation(({ data }) => ({ ...data, workspaces: [] })),
         },
      };
      const service = new WorkspaceService(prisma as never);

      await service.create({ name: 'Design' }, 'user-1');

      expect(prisma.workspace.findUnique).toHaveBeenNthCalledWith(1, {
         where: { slug: 'design' },
      });
      expect(prisma.workspace.findUnique).toHaveBeenNthCalledWith(2, {
         where: { slug: 'design-2' },
      });
      expect(prisma.workspace.findUnique).toHaveBeenNthCalledWith(3, {
         where: { slug: 'design-3' },
      });
      expect(prisma.organization.create).toHaveBeenCalledWith(
         expect.objectContaining({ data: expect.objectContaining({ slug: 'design-3' }) })
      );
   });
});
