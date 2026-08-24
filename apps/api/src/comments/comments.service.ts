import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

const commentInclude = { author: { select: { id: true, name: true, avatarUrl: true } } } as const;

@Injectable()
export class CommentsService {
   constructor(private readonly prisma: PrismaService) {}

   async list(workspaceId: string, issueId: string, userId: string) {
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
         ...comment,
         attachments: attachmentsByComment.get(comment.id) ?? [],
      }));
   }

   async create(dto: CreateCommentDto, userId: string) {
      await this.authorizeIssue(dto.workspaceId, dto.issueId, userId);
      return this.prisma.$transaction(async (tx) => {
         const comment = await tx.comment.create({
            data: { issueId: dto.issueId, authorId: userId, content: dto.content.trim() },
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
         return comment;
      });
   }

   async update(commentId: string, workspaceId: string, dto: UpdateCommentDto, userId: string) {
      const comment = await this.findAuthorizedComment(commentId, workspaceId, userId);
      if (comment.authorId !== userId)
         throw new ForbiddenException('Only the comment author can edit it.');
      return this.prisma.comment.update({
         where: { id: commentId },
         data: { content: dto.content.trim() },
         include: commentInclude,
      });
   }

   async remove(commentId: string, workspaceId: string, userId: string) {
      const comment = await this.findAuthorizedComment(commentId, workspaceId, userId);
      if (comment.authorId !== userId)
         throw new ForbiddenException('Only the comment author can delete it.');
      return this.prisma.comment.update({
         where: { id: commentId },
         data: { deletedAt: new Date() },
      });
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
