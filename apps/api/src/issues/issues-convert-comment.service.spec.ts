import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IssuesService } from './issues.service';

describe('IssuesService convertToComment', () => {
   const source = {
      id: 'issue-source',
      identifier: 'CORE-12',
      title: 'Retire the old task',
      description: 'Context retained from the source issue.',
   };
   const target = { id: 'issue-target', identifier: 'CORE-20' };

   const createService = (targetId: string | null = target.id) => {
      const tx = {
         comment: {
            create: jest.fn().mockResolvedValue({ id: 'comment-1', content: 'converted' }),
         },
         activity: { createMany: jest.fn().mockResolvedValue({ count: 2 }) },
         issue: { update: jest.fn().mockResolvedValue({ id: source.id }) },
      };
      const prisma = {
         issue: {
            findFirst: jest.fn().mockResolvedValue(targetId ? { id: targetId } : null),
         },
         $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
      };
      const service = new IssuesService(prisma as never, {} as never, {} as never, {} as never);
      jest
         .spyOn(service, 'get')
         .mockResolvedValueOnce(source as never)
         .mockResolvedValueOnce(target as never);
      return { service, prisma, tx };
   };

   it('creates a comment and archives the source in one transaction', async () => {
      const { service, tx } = createService();

      await expect(
         service.convertToComment(
            source.id,
            { workspaceId: 'workspace-1', targetIdentifier: 'core-20' },
            'user-1'
         )
      ).resolves.toEqual(
         expect.objectContaining({
            sourceIssueId: source.id,
            targetIssueId: target.id,
            targetIdentifier: target.identifier,
         })
      );
      expect(tx.comment.create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               issueId: target.id,
               content: expect.stringContaining(source.title),
               body: {
                  version: 1,
                  blocks: [{ type: 'paragraph', text: expect.stringContaining(source.title) }],
               },
            }),
         })
      );
      expect(tx.issue.update).toHaveBeenCalledWith(
         expect.objectContaining({
            where: { id: source.id },
            data: { archivedAt: expect.any(Date) },
         })
      );
      expect(tx.activity.createMany).toHaveBeenCalled();
   });

   it('rejects a missing target issue', async () => {
      const { service, prisma } = createService(null);

      await expect(
         service.convertToComment(
            source.id,
            { workspaceId: 'workspace-1', targetIdentifier: 'CORE-404' },
            'user-1'
         )
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
   });

   it('rejects converting an issue into itself', async () => {
      const { service, prisma } = createService(source.id);

      await expect(
         service.convertToComment(
            source.id,
            { workspaceId: 'workspace-1', targetIdentifier: source.identifier },
            'user-1'
         )
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
   });
});
