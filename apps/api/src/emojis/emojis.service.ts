import {
   BadRequestException,
   ConflictException,
   ForbiddenException,
   Injectable,
   NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../database/prisma.service';
import { MinioStorageService } from '../storage/minio-storage.service';
import { CreateWorkspaceEmojiDto } from './dto/create-workspace-emoji.dto';

export type UploadedEmojiFile = {
   originalname: string;
   mimetype: string;
   size: number;
   buffer: Buffer;
};

const emojiSelect = {
   id: true,
   workspaceId: true,
   name: true,
   filename: true,
   mimeType: true,
   size: true,
   createdAt: true,
   updatedAt: true,
   createdBy: { select: { id: true, name: true, avatarUrl: true } },
} as const;

function imageMime(buffer: Buffer): string | undefined {
   if (buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      return 'image/png';
   }
   if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
   const prefix = buffer.subarray(0, 6).toString('ascii');
   if (prefix === 'GIF87a' || prefix === 'GIF89a') return 'image/gif';
   if (
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
   ) {
      return 'image/webp';
   }
   return undefined;
}

@Injectable()
export class EmojisService {
   constructor(
      private readonly prisma: PrismaService,
      private readonly storage: MinioStorageService,
      private readonly audit: AuditService
   ) {}

   async list(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.workspaceEmoji.findMany({
         where: { workspaceId, archivedAt: null },
         select: emojiSelect,
         orderBy: { name: 'asc' },
      });
   }

   async create(
      dto: CreateWorkspaceEmojiDto,
      file: UploadedEmojiFile | undefined,
      userId: string
   ) {
      await this.authorizeManager(dto.workspaceId, userId);
      if (!file?.buffer?.length) throw new BadRequestException('An emoji image is required.');
      if (file.size > 512 * 1024)
         throw new BadRequestException('Emoji images may not exceed 512 KB.');
      const mimeType = imageMime(file.buffer);
      if (!mimeType) {
         throw new BadRequestException('Emoji images must be PNG, JPEG, GIF or WebP files.');
      }
      const name = dto.name.trim().toLowerCase();
      const existing = await this.prisma.workspaceEmoji.findUnique({
         where: { workspaceId_name: { workspaceId: dto.workspaceId, name } },
      });
      if (existing && !existing.archivedAt) {
         throw new ConflictException(`An emoji named :${name}: already exists.`);
      }
      const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType.slice('image/'.length);
      const filename = `${name}.${extension}`;
      const objectKey = `${dto.workspaceId}/emojis/${randomUUID()}-${filename}`;
      await this.storage.put(objectKey, file.buffer);
      const emoji = existing
         ? await this.prisma.workspaceEmoji.update({
              where: { id: existing.id },
              data: {
                 objectKey,
                 filename,
                 mimeType,
                 size: file.size,
                 createdById: userId,
                 archivedAt: null,
              },
              select: emojiSelect,
           })
         : await this.prisma.workspaceEmoji.create({
              data: {
                 workspaceId: dto.workspaceId,
                 name,
                 objectKey,
                 filename,
                 mimeType,
                 size: file.size,
                 createdById: userId,
              },
              select: emojiSelect,
           });
      await this.audit.record({
         workspaceId: dto.workspaceId,
         actorId: userId,
         action: 'workspace-emoji.uploaded',
         entityType: 'workspace-emoji',
         entityId: emoji.id,
         metadata: { name, mimeType, size: file.size },
      });
      return emoji;
   }

   async image(emojiId: string, workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      const emoji = await this.prisma.workspaceEmoji.findFirst({
         where: { id: emojiId, workspaceId, archivedAt: null },
      });
      if (!emoji) throw new NotFoundException('Emoji not found.');
      return { emoji, body: await this.storage.get(emoji.objectKey) };
   }

   async archive(emojiId: string, workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const existing = await this.prisma.workspaceEmoji.findFirst({
         where: { id: emojiId, workspaceId, archivedAt: null },
      });
      if (!existing) throw new NotFoundException('Emoji not found.');
      const emoji = await this.prisma.workspaceEmoji.update({
         where: { id: emojiId },
         data: { archivedAt: new Date() },
         select: emojiSelect,
      });
      await this.audit.record({
         workspaceId,
         actorId: userId,
         action: 'workspace-emoji.archived',
         entityType: 'workspace-emoji',
         entityId: emojiId,
         metadata: { name: existing.name },
      });
      return emoji;
   }

   private async authorize(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
         select: { id: true },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this workspace.');
   }

   private async authorizeManager(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
         select: { id: true },
      });
      if (!membership) throw new ForbiddenException('Workspace administrator access is required.');
   }
}
