import { AsksService } from './asks.service';

describe('AsksService.convert', () => {
   it('creates a real issue and persists the conversion', async () => {
      const ask = {
         id: 'ask-1',
         workspaceId: 'workspace-1',
         teamId: 'team-1',
         projectId: 'project-1',
         title: 'Prepare the launch checklist',
         description: 'Include owners and dates',
         priority: 'HIGH',
         status: 'open',
         createdById: 'user-1',
         convertedIssueId: null,
      };
      const update = jest.fn().mockResolvedValue({
         ...ask,
         status: 'accepted',
         convertedIssueId: 'issue-1',
      });
      const issues = {
         create: jest.fn().mockResolvedValue({ id: 'issue-1', identifier: 'OPS-42' }),
      };
      const service = new AsksService(
         {
            workspaceMember: { findFirst: jest.fn().mockResolvedValue({ role: 'MEMBER' }) },
            ask: { findFirst: jest.fn().mockResolvedValue(ask), update },
         } as never,
         { record: jest.fn().mockResolvedValue(undefined) } as never,
         issues as never
      );

      await expect(service.convert('ask-1', 'workspace-1', 'user-1')).resolves.toMatchObject({
         convertedIssueId: 'issue-1',
         status: 'accepted',
      });
      expect(issues.create).toHaveBeenCalledWith(
         expect.objectContaining({
            workspaceId: 'workspace-1',
            teamId: 'team-1',
            projectId: 'project-1',
            priority: 'HIGH',
         }),
         'user-1'
      );
      expect(update).toHaveBeenCalledWith(
         expect.objectContaining({
            data: { status: 'accepted', convertedIssueId: 'issue-1' },
         })
      );
   });
});
