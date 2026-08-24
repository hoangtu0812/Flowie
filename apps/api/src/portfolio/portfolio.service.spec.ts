import { PortfolioService } from './portfolio.service';

describe('PortfolioService saved views', () => {
   it('lists accessible views with the creator avatar needed by the upstream row', async () => {
      const views = [
         {
            id: 'view-1',
            description: 'High-priority work',
            createdBy: { id: 'user-1', name: 'Owner', avatarUrl: '/avatars/owner.png' },
         },
      ];
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
         savedView: { findMany: jest.fn().mockResolvedValue(views) },
      };
      const service = new PortfolioService(prisma as never, { record: jest.fn() } as never);

      await expect(service.savedViews('workspace-1', 'user-1')).resolves.toEqual(views);
      expect(prisma.savedView.findMany).toHaveBeenCalledWith(
         expect.objectContaining({
            where: {
               workspaceId: 'workspace-1',
               OR: [{ isShared: true }, { createdById: 'user-1' }],
            },
            include: {
               createdBy: { select: { id: true, name: true, avatarUrl: true } },
            },
         })
      );
   });

   it('trims and persists an optional description when creating a view', async () => {
      const savedView = { id: 'view-1', description: 'High-priority work' };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
         savedView: { create: jest.fn().mockResolvedValue(savedView) },
      };
      const service = new PortfolioService(prisma as never, { record: jest.fn() } as never);

      await expect(
         service.createSavedView(
            {
               workspaceId: 'workspace-1',
               name: '  Priorities  ',
               description: '  High-priority work  ',
               entityType: 'issue',
               filters: { priorityIds: ['high'] },
               isShared: true,
            },
            'user-1'
         )
      ).resolves.toEqual(savedView);
      expect(prisma.savedView.create).toHaveBeenCalledWith({
         data: {
            workspaceId: 'workspace-1',
            createdById: 'user-1',
            name: 'Priorities',
            description: 'High-priority work',
            entityType: 'issue',
            filters: { priorityIds: ['high'] },
            isShared: true,
         },
         include: {
            createdBy: { select: { id: true, name: true, avatarUrl: true } },
         },
      });
   });
});

describe('PortfolioService initiative records', () => {
   const initiative = {
      id: 'initiative-1',
      workspaceId: 'workspace-1',
      health: 'on-track',
   };

   it('persists an initiative update as a first-class record and audits its id', async () => {
      const tx = {
         initiative: { update: jest.fn().mockResolvedValue(initiative) },
         initiativeUpdate: {
            create: jest.fn().mockResolvedValue({
               id: 'update-1',
               body: 'Quarterly progress',
               health: 'at-risk',
            }),
         },
      };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
         initiative: { findFirst: jest.fn().mockResolvedValue(initiative) },
         $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      };
      const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-1' }) };
      const service = new PortfolioService(prisma as never, audit as never);

      await expect(
         service.createInitiativeUpdate(
            'initiative-1',
            { workspaceId: 'workspace-1', body: '  Quarterly progress  ', health: 'at-risk' },
            'user-1'
         )
      ).resolves.toEqual(expect.objectContaining({ id: 'update-1' }));

      expect(tx.initiativeUpdate.create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               workspaceId: 'workspace-1',
               initiativeId: 'initiative-1',
               authorId: 'user-1',
               body: 'Quarterly progress',
               health: 'at-risk',
            }),
         })
      );
      expect(audit.record).toHaveBeenCalledWith(
         expect.objectContaining({ metadata: expect.objectContaining({ updateId: 'update-1' }) })
      );
   });

   it('persists an initiative resource and keeps audit data as history only', async () => {
      const resource = {
         id: 'resource-1',
         label: 'Project brief',
         url: 'https://example.com/brief',
      };
      const prisma = {
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
         initiative: {
            findFirst: jest.fn().mockResolvedValue({ id: 'initiative-1' }),
         },
         initiativeResource: { create: jest.fn().mockResolvedValue(resource) },
      };
      const audit = { record: jest.fn().mockResolvedValue({ id: 'audit-2' }) };
      const service = new PortfolioService(prisma as never, audit as never);

      await expect(
         service.addInitiativeResource(
            'initiative-1',
            {
               workspaceId: 'workspace-1',
               label: ' Project brief ',
               url: 'https://example.com/brief',
            },
            'user-1'
         )
      ).resolves.toEqual(resource);

      expect(prisma.initiativeResource.create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               initiativeId: 'initiative-1',
               createdById: 'user-1',
               label: 'Project brief',
            }),
         })
      );
      expect(audit.record).toHaveBeenCalledWith(
         expect.objectContaining({
            metadata: expect.objectContaining({ resourceId: 'resource-1' }),
         })
      );
   });
});
