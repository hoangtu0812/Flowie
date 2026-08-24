import { IssuesService } from './issues.service';

describe('IssuesService personal state', () => {
   const accessibleIssue = {
      id: 'issue-1',
      identifier: 'CORE-1',
      workspaceId: 'workspace-1',
      teamId: 'team-1',
      archivedAt: null,
      status: { id: 'status-1', category: 'UNSTARTED' },
      project: null,
   };

   const serviceWith = (overrides: Record<string, unknown> = {}) => {
      const prisma = {
         issue: { findFirst: jest.fn().mockResolvedValue(accessibleIssue) },
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'member-1' }) },
         team: { findFirst: jest.fn().mockResolvedValue({ id: 'team-1' }) },
         issueFavorite: {
            upsert: jest.fn().mockResolvedValue({ issueId: 'issue-1', userId: 'user-1' }),
         },
         issueReminder: {
            upsert: jest.fn().mockResolvedValue({ id: 'reminder-1' }),
         },
         ...overrides,
      };
      const jobs = {
         enqueueIssueReminder: jest.fn().mockResolvedValue(undefined),
         cancelIssueReminder: jest.fn().mockResolvedValue(undefined),
      };
      const notifications = { notifyWorkspace: jest.fn().mockResolvedValue(undefined) };
      return {
         prisma,
         jobs,
         notifications,
         service: new IssuesService(
            prisma as never,
            notifications as never,
            {} as never,
            jobs as never
         ),
      };
   };

   it('persists a favorite for the current user after authorization', async () => {
      const { service, prisma } = serviceWith();

      await expect(service.favorite('issue-1', 'workspace-1', 'user-1')).resolves.toMatchObject({
         issueId: 'issue-1',
         userId: 'user-1',
      });
      expect(prisma.issueFavorite.upsert).toHaveBeenCalledWith(
         expect.objectContaining({ create: { issueId: 'issue-1', userId: 'user-1' } })
      );
   });

   it('persists and queues a future reminder', async () => {
      const { service, prisma, jobs } = serviceWith();
      const remindAt = new Date(Date.now() + 60_000).toISOString();

      await service.setReminder('issue-1', { workspaceId: 'workspace-1', remindAt }, 'user-1');

      expect(prisma.issueReminder.upsert).toHaveBeenCalledWith(
         expect.objectContaining({
            create: expect.objectContaining({ issueId: 'issue-1', userId: 'user-1' }),
         })
      );
      expect(jobs.enqueueIssueReminder).toHaveBeenCalledWith('reminder-1', new Date(remindAt));
   });

   it('moves an issue atomically and assigns a destination identifier', async () => {
      const moved = {
         ...accessibleIssue,
         teamId: 'team-2',
         identifier: 'OPS-7',
         title: 'Moved issue',
         team: { id: 'team-2', name: 'Operations', identifier: 'OPS' },
      };
      const tx = {
         team: {
            update: jest.fn().mockResolvedValue({
               id: 'team-2',
               name: 'Operations',
               identifier: 'OPS',
               issueSequence: 7,
            }),
         },
         issueStatus: { findFirst: jest.fn().mockResolvedValue({ id: 'status-2' }) },
         issueCycle: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
         issue: {
            updateMany: jest.fn().mockResolvedValue({ count: 0 }),
            update: jest.fn().mockResolvedValue(moved),
         },
         activity: { create: jest.fn().mockResolvedValue({ id: 'activity-1' }) },
      };
      const { service, notifications } = serviceWith({
         $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      });

      await expect(
         service.move('issue-1', { workspaceId: 'workspace-1', teamId: 'team-2' }, 'user-1')
      ).resolves.toMatchObject({ identifier: 'OPS-7', teamId: 'team-2' });
      expect(tx.issue.update).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               teamId: 'team-2',
               identifier: 'OPS-7',
               number: 7,
            }),
         })
      );
      expect(notifications.notifyWorkspace).toHaveBeenCalledWith(
         'workspace-1',
         'user-1',
         'issue.team_added',
         'issue',
         'issue-1',
         expect.objectContaining({ identifier: 'OPS-7', teamId: 'team-2' }),
         expect.stringContaining('Operations')
      );
   });

   it("marks an issue as won't fix and moves it to a canceled status", async () => {
      const classified = {
         ...accessibleIssue,
         resolution: 'WONT_FIX',
         statusId: 'status-canceled',
      };
      const tx = {
         issue: { update: jest.fn().mockResolvedValue(classified) },
         activity: { create: jest.fn().mockResolvedValue({ id: 'activity-1' }) },
      };
      const { service } = serviceWith({
         issueStatus: {
            findFirst: jest.fn().mockResolvedValue({ id: 'status-canceled', category: 'CANCELED' }),
         },
         $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      });

      await expect(
         service.classify(
            'issue-1',
            { workspaceId: 'workspace-1', resolution: 'WONT_FIX' as never },
            'user-1'
         )
      ).resolves.toMatchObject({ resolution: 'WONT_FIX', statusId: 'status-canceled' });
      expect(tx.issue.update).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               resolution: 'WONT_FIX',
               duplicateOfId: null,
               statusId: 'status-canceled',
            }),
         })
      );
   });

   it('links a duplicate only after confirming the target is accessible', async () => {
      const target = { ...accessibleIssue, id: 'issue-2', identifier: 'CORE-2' };
      const findFirst = jest
         .fn()
         .mockResolvedValueOnce(accessibleIssue)
         .mockResolvedValueOnce({ id: target.id, identifier: target.identifier })
         .mockResolvedValueOnce(target);
      const tx = {
         issue: {
            update: jest.fn().mockResolvedValue({
               ...accessibleIssue,
               resolution: 'DUPLICATE',
               duplicateOfId: target.id,
            }),
         },
         activity: { create: jest.fn().mockResolvedValue({ id: 'activity-1' }) },
      };
      const { service } = serviceWith({
         issue: { findFirst },
         issueStatus: { findFirst: jest.fn().mockResolvedValue({ id: 'status-canceled' }) },
         $transaction: jest.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
      });

      await service.classify(
         'issue-1',
         {
            workspaceId: 'workspace-1',
            resolution: 'DUPLICATE' as never,
            duplicateOfIdentifier: 'core-2',
         },
         'user-1'
      );

      expect(tx.issue.update).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({ duplicateOfId: 'issue-2' }),
         })
      );
   });
});
