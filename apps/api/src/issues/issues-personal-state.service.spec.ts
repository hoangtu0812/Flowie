import { IssuesService } from './issues.service';

describe('IssuesService personal state', () => {
   const accessibleIssue = {
      id: 'issue-1',
      workspaceId: 'workspace-1',
      teamId: 'team-1',
      archivedAt: null,
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
      return {
         prisma,
         jobs,
         service: new IssuesService(
            prisma as never,
            {} as never,
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

      await service.setReminder(
         'issue-1',
         { workspaceId: 'workspace-1', remindAt },
         'user-1'
      );

      expect(prisma.issueReminder.upsert).toHaveBeenCalledWith(
         expect.objectContaining({
            create: expect.objectContaining({ issueId: 'issue-1', userId: 'user-1' }),
         })
      );
      expect(jobs.enqueueIssueReminder).toHaveBeenCalledWith('reminder-1', new Date(remindAt));
   });
});
