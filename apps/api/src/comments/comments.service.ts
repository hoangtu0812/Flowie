import {
   BadRequestException,
   ForbiddenException,
   Injectable,
   NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@circle/database';
import {
   contentDocumentFromText,
   contentDocumentToPlainText,
   isContentDocument,
   normalizeContentDocument,
   type ContentDocument,
} from '@circle/contracts';
import { PrismaService } from '../database/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

const commentInclude = {
   author: { select: { id: true, name: true, avatarUrl: true } },
   reactions: { select: { emoji: true, userId: true }, orderBy: { createdAt: 'asc' } },
} as const;

type ReactionRow = { emoji: string; userId: string };

export type CommentReactionResponse = {
   emoji: string;
   count: number;
   reacted: boolean;
};

export type CommentAuthorResponse = {
   id: string;
   name: string;
   avatarUrl: string | null;
};

export type CommentResponse = {
   id: string;
   issueId: string;
   authorId: string;
   content: string;
   body: ContentDocument;
   createdAt: Date;
   updatedAt: Date;
   deletedAt: Date | null;
   author: CommentAuthorResponse;
   reactions: CommentReactionResponse[];
};

export type CommentAttachmentResponse = {
   id: string;
   filename: string;
   mimeType: string;
   size: number;
   createdAt: Date;
   entityId: string;
};

export type CommentListResponse = CommentResponse & {
   attachments: CommentAttachmentResponse[];
};

export type DeletedCommentResponse = {
   id: string;
   issueId: string;
   authorId: string;
   content: string;
   body: unknown;
   createdAt: Date;
   updatedAt: Date;
   deletedAt: Date | null;
};

type CommentWithPresentationRelations = Omit<CommentResponse, 'body' | 'reactions'> & {
   body: unknown;
   reactions: ReactionRow[];
};

const summarizeReactions = (
   rows: ReactionRow[],
   userId: string
): CommentReactionResponse[] => {
   const reactions = new Map<string, { emoji: string; count: number; reacted: boolean }>();
   for (const row of rows) {
      const current = reactions.get(row.emoji) ?? {
         emoji: row.emoji,
         count: 0,
         reacted: false,
      };
      current.count += 1;
      current.reacted ||= row.userId === userId;
      reactions.set(row.emoji, current);
   }
   return [...reactions.values()];
};

@Injectable()
export class CommentsService {
   constructor(private readonly prisma: PrismaService) {}

   async list(workspaceId: string, issueId: string, userId: string): Promise<CommentListResponse[]> {
      await this.authorizeIssue(workspaceId, issueId, userId);
      const comments = await this.prisma.comment.findMany({
         where: { issueId, deletedAt: null },
         include: commentInclude,
         orderBy: { createdAt: 'asc' },
      });
      const attachments = await this.prisma.attachment.findMany({
         where: {
            workspaceId,
            entityType: 'comment',
            entityId: { in: comments.map((comment) => comment.id) },
         },
         select: {
            id: true,
            filename: true,
            mimeType: true,
            size: true,
            createdAt: true,
            entityId: true,
         },
         orderBy: { createdAt: 'asc' },
      });
      const attachmentsByComment = new Map<string, typeof attachments>();
      for (const attachment of attachments) {
         attachmentsByComment.set(attachment.entityId, [
            ...(attachmentsByComment.get(attachment.entityId) ?? []),
            attachment,
         ]);
      }
      return comments.map((comment) => ({
         ...this.presentComment(comment, userId),
         attachments: attachmentsByComment.get(comment.id) ?? [],
      }));
   }

   async create(dto: CreateCommentDto, userId: string): Promise<CommentResponse> {
      await this.authorizeIssue(dto.workspaceId, dto.issueId, userId);
      const input = this.commentInput(dto.content, dto.body);
      return this.prisma.$transaction(async (tx) => {
         const comment = await tx.comment.create({
            data: { issueId: dto.issueId, authorId: userId, ...input },
            include: commentInclude,
         });
         await tx.activity.create({
            data: {
               workspaceId: dto.workspaceId,
               issueId: dto.issueId,
               actorId: userId,
               type: 'comment.created',
               data: { commentId: comment.id },
            },
         });
         return this.presentComment(comment, userId);
      });
   }

   async update(
      commentId: string,
      workspaceId: string,
      dto: UpdateCommentDto,
      userId: string
   ): Promise<CommentResponse> {
      const comment = await this.findAuthorizedComment(commentId, workspaceId, userId);
      if (comment.authorId !== userId)
         throw new ForbiddenException('Only the comment author can edit it.');
      const input = this.commentInput(dto.content, dto.body);
      const updated = await this.prisma.comment.update({
         where: { id: commentId },
         data: input,
         include: commentInclude,
      });
      return this.presentComment(updated, userId);
   }

   async remove(
      commentId: string,
      workspaceId: string,
      userId: string
   ): Promise<DeletedCommentResponse> {
      const comment = await this.findAuthorizedComment(commentId, workspaceId, userId);
      if (comment.authorId !== userId)
         throw new ForbiddenException('Only the comment author can delete it.');
      return this.prisma.comment.update({
         where: { id: commentId },
         data: { deletedAt: new Date() },
      });
   }

   async reactions(
      commentId: string,
      workspaceId: string,
      userId: string
   ): Promise<CommentReactionResponse[]> {
      await this.findAuthorizedComment(commentId, workspaceId, userId);
      return this.reactionSummary(commentId, userId);
   }

   async toggleReaction(
      commentId: string,
      workspaceId: string,
      value: string,
      userId: string
   ): Promise<CommentReactionResponse[]> {
      await this.findAuthorizedComment(commentId, workspaceId, userId);
      const emoji = value.trim();
      if (!emoji || emoji.length > 32) throw new BadRequestException('Reaction emoji is invalid.');
      const key = { commentId_userId_emoji: { commentId, userId, emoji } };
      await this.prisma.$transaction(async (tx) => {
         const existing = await tx.commentReaction.findUnique({ where: key });
         if (existing) {
            await tx.commentReaction.delete({ where: key });
         } else {
            await tx.commentReaction.create({ data: { commentId, userId, emoji } });
         }
      });
      return this.reactionSummary(commentId, userId);
   }

   private async reactionSummary(
      commentId: string,
      userId: string
   ): Promise<CommentReactionResponse[]> {
      const rows = await this.prisma.commentReaction.findMany({
         where: { commentId },
         select: { emoji: true, userId: true },
         orderBy: { createdAt: 'asc' },
      });
      return summarizeReactions(rows, userId);
   }

   private commentInput(content: string | undefined, value: unknown) {
      let body: ContentDocument;
      if (value !== undefined) {
         if (!isContentDocument(value)) {
            throw new BadRequestException(
               'Comment body does not match the supported content version.'
            );
         }
         body = value;
      } else if (typeof content === 'string') {
         body = contentDocumentFromText(content.trim());
      } else {
         throw new BadRequestException('Comment content is required.');
      }
      const canonicalContent = contentDocumentToPlainText(body).trim();
      if (!canonicalContent || canonicalContent.length > 20_000) {
         throw new BadRequestException(
            'Comment content must contain between 1 and 20000 characters.'
         );
      }
      return {
         content: canonicalContent,
         body: body as unknown as Prisma.InputJsonValue,
      };
   }

   private presentComment(
      comment: CommentWithPresentationRelations,
      userId: string
   ): CommentResponse {
      const { reactions, ...rest } = comment;
      return {
         ...rest,
         body: normalizeContentDocument(comment.body, comment.content),
         reactions: summarizeReactions(reactions, userId),
      };
   }

   private async findAuthorizedComment(commentId: string, workspaceId: string, userId: string) {
      const comment = await this.prisma.comment.findFirst({
         where: { id: commentId, deletedAt: null },
         include: { issue: { select: { workspaceId: true, teamId: true, archivedAt: true } } },
      });
      if (!comment || comment.issue.workspaceId !== workspaceId || comment.issue.archivedAt) {
         throw new NotFoundException('Comment not found.');
      }
      await this.authorizeIssue(workspaceId, comment.issueId, userId);
      return comment;
   }

   private async authorizeIssue(workspaceId: string, issueId: string, userId: string) {
      const issue = await this.prisma.issue.findFirst({
         where: { id: issueId, workspaceId, archivedAt: null },
         select: { teamId: true },
      });
      if (!issue) throw new NotFoundException('Issue not found.');
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this workspace.');
      const team = await this.prisma.team.findFirst({
         where: {
            id: issue.teamId,
            workspaceId,
            archivedAt: null,
            members: { some: { userId } },
         },
      });
      if (!team) throw new ForbiddenException('You do not have access to this team.');
   }
}
