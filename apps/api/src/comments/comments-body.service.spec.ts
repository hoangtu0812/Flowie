import { BadRequestException } from '@nestjs/common';
import { contentDocumentFromText } from '@circle/contracts';
import { CommentsService } from './comments.service';

function createBodyService() {
   const created = {
      id: 'comment-1',
      issueId: 'issue-1',
      authorId: 'user-1',
      content: 'Structured comment',
      body: contentDocumentFromText('Structured comment'),
      reactions: [],
      author: { id: 'user-1', name: 'Member', avatarUrl: null },
   };
   const tx = {
      comment: { create: jest.fn().mockResolvedValue(created) },
      activity: { create: jest.fn().mockResolvedValue({}) },
   };
   const prisma = {
      issue: { findFirst: jest.fn().mockResolvedValue({ teamId: 'team-1' }) },
      workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'membership-1' }) },
      team: { findFirst: jest.fn().mockResolvedValue({ id: 'team-1' }) },
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
   };
   return { service: new CommentsService(prisma as never), prisma, tx };
}

describe('CommentsService versioned bodies', () => {
   it('persists a versioned body and derives canonical content from it', async () => {
      const { service, tx } = createBodyService();
      const body = {
         version: 1 as const,
         blocks: [
            { type: 'heading' as const, text: 'Decision' },
            { type: 'paragraph' as const, text: 'Use the shared contract.' },
         ],
      };

      await service.create({ workspaceId: 'workspace-1', issueId: 'issue-1', body }, 'user-1');

      expect(tx.comment.create).toHaveBeenCalledWith(
         expect.objectContaining({
            data: expect.objectContaining({
               content: 'Decision\nUse the shared contract.',
               body,
            }),
         })
      );
   });

   it('rejects an unsupported body version before writing', async () => {
      const { service, prisma } = createBodyService();

      await expect(
         service.create(
            {
               workspaceId: 'workspace-1',
               issueId: 'issue-1',
               body: { version: 2, blocks: [] },
            },
            'user-1'
         )
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
   });

   it('normalizes a legacy nullable body when listing comments', async () => {
      const prisma = {
         issue: { findFirst: jest.fn().mockResolvedValue({ teamId: 'team-1' }) },
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'membership-1' }) },
         team: { findFirst: jest.fn().mockResolvedValue({ id: 'team-1' }) },
         comment: {
            findMany: jest.fn().mockResolvedValue([
               {
                  id: 'comment-legacy',
                  content: 'Legacy comment',
                  body: null,
                  reactions: [],
                  author: { id: 'user-1', name: 'Member', avatarUrl: null },
               },
            ]),
         },
         attachment: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const service = new CommentsService(prisma as never);

      await expect(service.list('workspace-1', 'issue-1', 'user-1')).resolves.toEqual([
         expect.objectContaining({
            id: 'comment-legacy',
            body: contentDocumentFromText('Legacy comment'),
            reactions: [],
         }),
      ]);
   });

   it('updates body and canonical content together', async () => {
      const body = {
         version: 1 as const,
         blocks: [{ type: 'quote' as const, text: 'Updated decision', author: 'Member' }],
      };
      const updated = {
         id: 'comment-1',
         issueId: 'issue-1',
         authorId: 'user-1',
         content: 'Updated decision',
         body,
         reactions: [],
         author: { id: 'user-1', name: 'Member', avatarUrl: null },
      };
      const prisma = {
         comment: {
            findFirst: jest.fn().mockResolvedValue({
               id: 'comment-1',
               issueId: 'issue-1',
               authorId: 'user-1',
               issue: { workspaceId: 'workspace-1', teamId: 'team-1', archivedAt: null },
            }),
            update: jest.fn().mockResolvedValue(updated),
         },
         issue: { findFirst: jest.fn().mockResolvedValue({ teamId: 'team-1' }) },
         workspaceMember: { findFirst: jest.fn().mockResolvedValue({ id: 'membership-1' }) },
         team: { findFirst: jest.fn().mockResolvedValue({ id: 'team-1' }) },
      };
      const service = new CommentsService(prisma as never);

      await expect(
         service.update('comment-1', 'workspace-1', { body }, 'user-1')
      ).resolves.toEqual(updated);
      expect(prisma.comment.update).toHaveBeenCalledWith(
         expect.objectContaining({
            data: { content: 'Updated decision', body },
         })
      );
   });
});
