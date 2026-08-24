import { ForbiddenException } from '@nestjs/common';
import { IssueRelationType } from '@circle/database';
import { IssuesService } from './issues.service';

const relatedIssue = (id: string) => ({
   id,
   identifier: id.toUpperCase(),
   title: `Issue ${id}`,
   status: { id: 'status-1', name: 'Todo', color: '#999', category: 'TODO' },
   team: { id: 'team-1', name: 'Core', identifier: 'CORE' },
});

describe('IssuesService relation types', () => {
   it('maps persisted relation direction into the current issue perspective', async () => {
      const current = relatedIssue('issue-current');
      const blocked = relatedIssue('issue-blocked');
      const blocker = relatedIssue('issue-blocker');
      const related = relatedIssue('issue-related');
      const prisma = {
         issueRelation: {
            findMany: jest.fn().mockResolvedValue([
               {
                  issueId: current.id,
                  relatedIssueId: blocked.id,
                  type: IssueRelationType.BLOCKS,
                  issue: current,
                  relatedIssue: blocked,
               },
               {
                  issueId: blocker.id,
                  relatedIssueId: current.id,
                  type: IssueRelationType.BLOCKS,
                  issue: blocker,
                  relatedIssue: current,
               },
               {
                  issueId: current.id,
                  relatedIssueId: related.id,
                  type: IssueRelationType.RELATED,
                  issue: current,
                  relatedIssue: related,
               },
            ]),
         },
      };
      const service = new IssuesService(prisma as never, {} as never, {} as never, {} as never);
      jest.spyOn(service, 'get').mockResolvedValue(current as never);

      await expect(service.relations(current.id, 'workspace-1', 'user-1')).resolves.toEqual([
         expect.objectContaining({ id: blocked.id, relationKind: 'BLOCKS' }),
         expect.objectContaining({ id: blocker.id, relationKind: 'BLOCKED_BY' }),
         expect.objectContaining({ id: related.id, relationKind: 'RELATED' }),
      ]);
      expect(prisma.issueRelation.findMany).toHaveBeenCalledWith(
         expect.objectContaining({
            where: expect.objectContaining({
               workspaceId: 'workspace-1',
               OR: expect.arrayContaining([
                  expect.objectContaining({
                     relatedIssue: expect.objectContaining({
                        archivedAt: null,
                        team: { members: { some: { userId: 'user-1' } } },
                     }),
                  }),
               ]),
            }),
         })
      );
   });

   it('persists the selected blocker direction and perspective-aware activity payloads', async () => {
      const blocked = relatedIssue('issue-z');
      const blocker = relatedIssue('issue-a');
      const relation = {
         issueId: blocker.id,
         relatedIssueId: blocked.id,
         type: IssueRelationType.BLOCKS,
      };
      const tx = {
         issueRelation: { create: jest.fn().mockResolvedValue(relation) },
         activity: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      };
      const prisma = {
         issueRelation: { findFirst: jest.fn().mockResolvedValue(null) },
         $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      };
      const service = new IssuesService(prisma as never, {} as never, {} as never, {} as never);
      jest
         .spyOn(service, 'get')
         .mockResolvedValueOnce(blocked as never)
         .mockResolvedValueOnce(blocker as never);

      await service.addRelation(
         blocked.id,
         {
            workspaceId: 'workspace-1',
            relatedIssueId: blocker.id,
            type: IssueRelationType.BLOCKS,
         },
         'user-1'
      );

      expect(tx.issueRelation.create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               issueId: blocker.id,
               relatedIssueId: blocked.id,
               type: IssueRelationType.BLOCKS,
            }),
         })
      );
      expect(tx.activity.createMany).toHaveBeenCalledWith({
         data: [
            expect.objectContaining({
               issueId: blocked.id,
               data: expect.objectContaining({
                  relationType: 'BLOCKS',
                  relationKind: 'BLOCKED_BY',
               }),
            }),
            expect.objectContaining({
               issueId: blocker.id,
               data: expect.objectContaining({ relationType: 'BLOCKS', relationKind: 'BLOCKS' }),
            }),
         ],
      });
   });

   it('does not link an issue the user cannot access', async () => {
      const prisma = { issueRelation: { findFirst: jest.fn() }, $transaction: jest.fn() };
      const service = new IssuesService(prisma as never, {} as never, {} as never, {} as never);
      jest
         .spyOn(service, 'get')
         .mockResolvedValueOnce(relatedIssue('issue-current') as never)
         .mockRejectedValueOnce(new ForbiddenException());

      await expect(
         service.addRelation(
            'issue-current',
            {
               workspaceId: 'workspace-1',
               relatedIssueId: 'issue-private',
               type: IssueRelationType.RELATED,
            },
            'user-1'
         )
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.issueRelation.findFirst).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
   });

   it('updates an existing symmetric link into the selected blocker direction', async () => {
      const blocked = relatedIssue('issue-a');
      const blocker = relatedIssue('issue-z');
      const existing = {
         issueId: blocked.id,
         relatedIssueId: blocker.id,
         type: IssueRelationType.RELATED,
         issue: blocked,
         relatedIssue: blocker,
      };
      const updated = {
         ...existing,
         issueId: blocker.id,
         relatedIssueId: blocked.id,
         type: IssueRelationType.BLOCKS,
      };
      const tx = {
         issueRelation: { update: jest.fn().mockResolvedValue(updated) },
         activity: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
      };
      const prisma = {
         issueRelation: { findFirst: jest.fn().mockResolvedValue(existing) },
         $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      };
      const service = new IssuesService(prisma as never, {} as never, {} as never, {} as never);
      jest
         .spyOn(service, 'get')
         .mockResolvedValueOnce(blocked as never)
         .mockResolvedValueOnce(blocker as never);

      await service.updateRelation(
         blocked.id,
         blocker.id,
         { workspaceId: 'workspace-1', type: IssueRelationType.BLOCKS },
         'user-1'
      );

      expect(tx.issueRelation.update).toHaveBeenCalledWith(
         expect.objectContaining({
            where: {
               issueId_relatedIssueId: {
                  issueId: blocked.id,
                  relatedIssueId: blocker.id,
               },
            },
            data: expect.objectContaining({
               issueId: blocker.id,
               relatedIssueId: blocked.id,
               type: IssueRelationType.BLOCKS,
            }),
         })
      );
   });
});
