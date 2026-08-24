import {
   BadRequestException,
   ForbiddenException,
   Injectable,
   NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { MinioStorageService } from '../storage/minio-storage.service';
import { CreateAttachmentDto } from './dto/create-attachment.dto';

export type UploadedFile = { originalname: string; mimetype: string; size: number; buffer: Buffer };

@Injectable()
export class AttachmentsService {
   constructor(
      private readonly prisma: PrismaService,
      private readonly storage: MinioStorageService
   ) {}

   async list(workspaceId: string, entityType: string, entityId: string, userId: string) {
      await this.authorizeEntity(workspaceId, entityType, entityId, userId);
      return this.prisma.attachment.findMany({
         where: { workspaceId, entityType, entityId },
         include: { uploadedBy: { select: { id: true, name: true, avatarUrl: true } } },
         orderBy: { createdAt: 'desc' },
      });
   }

   async create(dto: CreateAttachmentDto, file: UploadedFile | undefined, userId: string) {
      if (!file?.buffer?.length) throw new BadRequestException('A file is required.');
      if (file.size > 10 * 1024 * 1024)
         throw new BadRequestException('Files may not exceed 10 MB.');
      await this.authorizeEntity(dto.workspaceId, dto.entityType, dto.entityId, userId);
      const filename =
         file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 180) || 'attachment';
      const objectKey = `${dto.workspaceId}/${userId}/${randomUUID()}-${filename}`;
      await this.storage.put(objectKey, file.buffer);
      return this.prisma.attachment.create({
         data: {
            ...dto,
            uploadedById: userId,
            objectKey,
            filename,
            mimeType: file.mimetype || 'application/octet-stream',
            size: file.size,
         },
         include: { uploadedBy: { select: { id: true, name: true, avatarUrl: true } } },
      });
   }

   async download(attachmentId: string, userId: string) {
      const attachment = await this.prisma.attachment.findUnique({ where: { id: attachmentId } });
      if (!attachment) throw new NotFoundException('Attachment not found.');
      await this.authorizeEntity(
         attachment.workspaceId,
         attachment.entityType,
         attachment.entityId,
         userId
      );
      return { attachment, body: await this.storage.get(attachment.objectKey) };
   }

   private async authorizeEntity(
      workspaceId: string,
      entityType: string,
      entityId: string,
      userId: string
   ) {
      const member = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      if (!member) throw new ForbiddenException('You do not have access to this workspace.');
      const teamId = await this.entityTeamId(workspaceId, entityType, entityId);
      if (!teamId) return;
      const team = await this.prisma.team.findFirst({
         where: { id: teamId, workspaceId, members: { some: { userId } } },
      });
      if (!team) throw new ForbiddenException('You do not have access to this attachment target.');
   }

   private async entityTeamId(
      workspaceId: string,
      entityType: string,
      entityId: string
   ): Promise<string | null> {
      if (entityType === 'issue') {
         const issue = await this.prisma.issue.findFirst({
            where: { id: entityId, workspaceId, archivedAt: null },
            select: { teamId: true },
         });
         if (!issue) throw new NotFoundException('Issue not found.');
         return issue.teamId;
      }
      if (entityType === 'comment') {
         const comment = await this.prisma.comment.findFirst({
            where: { id: entityId, issue: { workspaceId } },
            include: { issue: { select: { teamId: true } } },
         });
         if (!comment) throw new NotFoundException('Comment not found.');
         return comment.issue.teamId;
      }
      if (entityType === 'project') {
         const project = await this.prisma.project.findFirst({
            where: { id: entityId, workspaceId, archivedAt: null },
            select: { teamId: true },
         });
         if (!project) throw new NotFoundException('Project not found.');
         return project.teamId;
      }
      if (entityType === 'project-update') {
         const update = await this.prisma.projectUpdate.findFirst({
            where: { id: entityId, workspaceId, project: { archivedAt: null } },
            include: { project: { select: { teamId: true } } },
         });
         if (!update) throw new NotFoundException('Project update not found.');
         return update.project.teamId;
      }
      if (entityType === 'document') {
         const document = await this.prisma.document.findFirst({
            where: { id: entityId, workspaceId, archivedAt: null },
            select: { teamId: true },
         });
         if (!document) throw new NotFoundException('Document not found.');
         return document.teamId;
      }
      throw new BadRequestException('Unsupported attachment target.');
   }
}
