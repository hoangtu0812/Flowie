import { PortfolioService } from './portfolio.service';

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
