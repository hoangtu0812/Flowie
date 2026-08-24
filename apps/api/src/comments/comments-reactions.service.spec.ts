import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { CommentsService } from './comments.service';

type AuthorizedComment = {
   id: string;
   issueId: string;
   authorId: string;
   issue: { workspaceId: string; teamId: string; archivedAt: Date | null };
};

const authorizedComment: AuthorizedComment = {
   id: 'comment-1',
   issueId: 'issue-1',
   authorId: 'author-1',
   issue: { workspaceId: 'workspace-1', teamId: 'team-1', archivedAt: null },
};

function createReactionService(options?: {
   comment?: AuthorizedComment | null;
   workspaceMember?: object | null;
   team?: object | null;
   existingReaction?: object | null;
}) {
   const tx = {
      commentReaction: {
         findUnique: jest.fn().mockResolvedValue(options?.existingReaction ?? null),
         create: jest.fn().mockResolvedValue({}),
         delete: jest.fn().mockResolvedValue({}),
      },
   };
   const prisma = {
      comment: {
         findFirst: jest
            .fn()
            .mockResolvedValue(
               options && 'comment' in options ? options.comment : authorizedComment
            ),
      },
      issue: { findFirst: jest.fn().mockResolvedValue({ teamId: 'team-1' }) },
      workspaceMember: {
         findFirst: jest
            .fn()
            .mockResolvedValue(
               options && 'workspaceMember' in options
                  ? options.workspaceMember
                  : { id: 'workspace-member-1' }
            ),
      },
      team: {
         findFirst: jest
            .fn()
            .mockResolvedValue(options && 'team' in options ? options.team : { id: 'team-1' }),
      },
      commentReaction: {
         findMany: jest.fn().mockResolvedValue([
            { emoji: '👍', userId: 'user-1' },
            { emoji: '👍', userId: 'user-2' },
            { emoji: '🎉', userId: 'user-2' },
         ]),
      },
      $transaction: jest.fn((operation: (client: typeof tx) => unknown) => operation(tx)),
   };
   return { service: new CommentsService(prisma as never), prisma, tx };
}

describe('CommentsService reactions', () => {
   it('aggregates counts and current-user reaction truth', async () => {
      const { service } = createReactionService();

      await expect(service.reactions('comment-1', 'workspace-1', 'user-1')).resolves.toEqual([
         { emoji: '👍', count: 2, reacted: true },
         { emoji: '🎉', count: 1, reacted: false },
      ]);
   });

   it('creates a missing reaction and returns the updated aggregate', async () => {
      const { service, tx } = createReactionService();

      await service.toggleReaction('comment-1', 'workspace-1', '👍', 'user-1');

      expect(tx.commentReaction.create).toHaveBeenCalledWith({
         data: { commentId: 'comment-1', userId: 'user-1', emoji: '👍' },
      });
      expect(tx.commentReaction.delete).not.toHaveBeenCalled();
   });

   it('removes an existing reaction', async () => {
      const { service, tx } = createReactionService({
         existingReaction: { createdAt: new Date() },
      });

      await service.toggleReaction('comment-1', 'workspace-1', '👍', 'user-1');

      expect(tx.commentReaction.delete).toHaveBeenCalledWith({
         where: {
            commentId_userId_emoji: {
               commentId: 'comment-1',
               userId: 'user-1',
               emoji: '👍',
            },
         },
      });
      expect(tx.commentReaction.create).not.toHaveBeenCalled();
   });

   it('does not expose reactions for a deleted comment', async () => {
      const { service, prisma } = createReactionService({ comment: null });

      await expect(service.reactions('comment-1', 'workspace-1', 'user-1')).rejects.toBeInstanceOf(
         NotFoundException
      );
      expect(prisma.commentReaction.findMany).not.toHaveBeenCalled();
   });

   it('does not expose reactions for a comment whose issue is archived', async () => {
      const { service, prisma } = createReactionService({
         comment: {
            ...authorizedComment,
            issue: { ...authorizedComment.issue, archivedAt: new Date() },
         },
      });

      await expect(service.reactions('comment-1', 'workspace-1', 'user-1')).rejects.toBeInstanceOf(
         NotFoundException
      );
      expect(prisma.issue.findFirst).not.toHaveBeenCalled();
      expect(prisma.commentReaction.findMany).not.toHaveBeenCalled();
   });

   it('does not expose reactions to an inactive or external workspace user', async () => {
      const { service, prisma } = createReactionService({ workspaceMember: null });

      await expect(service.reactions('comment-1', 'workspace-1', 'user-1')).rejects.toBeInstanceOf(
         ForbiddenException
      );
      expect(prisma.commentReaction.findMany).not.toHaveBeenCalled();
   });

   it('does not toggle reactions on a comment in an archived team', async () => {
      const { service, prisma } = createReactionService({ team: null });

      await expect(
         service.toggleReaction('comment-1', 'workspace-1', '👍', 'user-1')
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
   });
});
