import {
   BadRequestException,
   ConflictException,
   ForbiddenException,
   Injectable,
   NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CreateDocumentFolderDto } from './dto/create-document-folder.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { UpdateDocumentFolderDto } from './dto/update-document-folder.dto';

const documentInclude = {
   createdBy: { select: { id: true, name: true, avatarUrl: true } },
   updatedBy: { select: { id: true, name: true, avatarUrl: true } },
   team: { select: { id: true, name: true, identifier: true } },
   folder: { select: { id: true, name: true, icon: true, position: true } },
} as const;

@Injectable()
export class DocumentsService {
   constructor(private readonly prisma: PrismaService) {}

   async list(workspaceId: string, userId: string, teamId?: string) {
      await this.authorize(workspaceId, userId, teamId);
      return this.prisma.document.findMany({
         where: { workspaceId, archivedAt: null, ...(teamId ? { teamId } : {}) },
         include: documentInclude,
         orderBy: { updatedAt: 'desc' },
      });
   }

   async listFolders(workspaceId: string, teamId: string, userId: string) {
      if (!workspaceId || !teamId) {
         throw new BadRequestException('workspaceId and teamId are required.');
      }
      await this.authorize(workspaceId, userId, teamId);
      return this.prisma.documentFolder.findMany({
         where: { workspaceId, teamId },
         include: {
            documents: {
               where: { archivedAt: null },
               include: documentInclude,
               orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
            },
         },
         orderBy: [{ position: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      });
   }

   async createFolder(dto: CreateDocumentFolderDto, userId: string) {
      await this.authorize(dto.workspaceId, userId, dto.teamId);
      const name = dto.name.trim();
      if (name.length < 2) throw new BadRequestException('Folder name is too short.');
      const duplicate = await this.prisma.documentFolder.findFirst({
         where: { workspaceId: dto.workspaceId, teamId: dto.teamId, name },
         select: { id: true },
      });
      if (duplicate)
         throw new ConflictException('A document folder with this name already exists.');

      const lastFolder = await this.prisma.documentFolder.aggregate({
         where: { workspaceId: dto.workspaceId, teamId: dto.teamId },
         _max: { position: true },
      });
      return this.prisma.documentFolder.create({
         data: {
            workspaceId: dto.workspaceId,
            teamId: dto.teamId,
            name,
            icon: dto.icon ?? '📁',
            position: (lastFolder._max.position ?? -1) + 1,
         },
      });
   }

   async updateFolder(
      folderId: string,
      workspaceId: string,
      dto: UpdateDocumentFolderDto,
      userId: string
   ) {
      const folder = await this.prisma.documentFolder.findFirst({
         where: { id: folderId, workspaceId },
      });
      if (!folder) throw new NotFoundException('Document folder not found.');
      await this.authorize(workspaceId, userId, folder.teamId);

      const name = dto.name?.trim();
      if (dto.name !== undefined && (!name || name.length < 2)) {
         throw new BadRequestException('Folder name is too short.');
      }
      if (name && name !== folder.name) {
         const duplicate = await this.prisma.documentFolder.findFirst({
            where: { workspaceId, teamId: folder.teamId, name, id: { not: folderId } },
            select: { id: true },
         });
         if (duplicate)
            throw new ConflictException('A document folder with this name already exists.');
      }
      return this.prisma.documentFolder.update({
         where: { id: folderId },
         data: { ...dto, ...(dto.name === undefined ? {} : { name: name! }) },
      });
   }

   async create(dto: CreateDocumentDto, userId: string) {
      await this.authorize(dto.workspaceId, userId, dto.teamId);
      const title = dto.title.trim();
      if (title.length < 2) throw new BadRequestException('Document title is too short.');
      const folder = await this.resolveFolder(dto.workspaceId, dto.teamId, dto.folderId);
      const position =
         dto.position ?? (folder ? await this.nextDocumentPosition(folder.id) : undefined);
      return this.prisma.document.create({
         data: {
            ...dto,
            title,
            folderId: folder?.id,
            position,
            createdById: userId,
            updatedById: userId,
         },
         include: documentInclude,
      });
   }

   async update(documentId: string, workspaceId: string, dto: UpdateDocumentDto, userId: string) {
      const document = await this.prisma.document.findFirst({
         where: { id: documentId, workspaceId, archivedAt: null },
      });
      if (!document) throw new NotFoundException('Document not found.');
      await this.authorize(workspaceId, userId, document.teamId ?? undefined);
      const title = dto.title?.trim();
      if (dto.title !== undefined && (!title || title.length < 2)) {
         throw new BadRequestException('Document title is too short.');
      }
      const folder = dto.folderId
         ? await this.resolveFolder(workspaceId, document.teamId ?? undefined, dto.folderId)
         : undefined;
      const position =
         folder && folder.id !== document.folderId && dto.position === undefined
            ? await this.nextDocumentPosition(folder.id)
            : dto.position;
      return this.prisma.document.update({
         where: { id: documentId },
         data: {
            ...dto,
            ...(dto.title === undefined ? {} : { title: title! }),
            ...(folder ? { folderId: folder.id } : {}),
            ...(position === undefined ? {} : { position }),
            updatedById: userId,
         },
         include: documentInclude,
      });
   }

   private async resolveFolder(workspaceId: string, teamId?: string, folderId?: string) {
      if (!teamId) {
         if (folderId)
            throw new BadRequestException('Workspace documents cannot use a team folder.');
         return undefined;
      }

      const folder = folderId
         ? await this.prisma.documentFolder.findFirst({
              where: { id: folderId, workspaceId, teamId },
           })
         : await this.prisma.documentFolder.findFirst({
              where: { workspaceId, teamId },
              orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
           });
      if (!folder) throw new NotFoundException('Document folder not found.');
      return folder;
   }

   private async nextDocumentPosition(folderId: string) {
      const lastDocument = await this.prisma.document.aggregate({
         where: { folderId },
         _max: { position: true },
      });
      return (lastDocument._max.position ?? -1) + 1;
   }

   async archive(documentId: string, workspaceId: string, userId: string) {
      const document = await this.prisma.document.findFirst({
         where: { id: documentId, workspaceId, archivedAt: null },
      });
      if (!document) throw new NotFoundException('Document not found.');
      await this.authorize(workspaceId, userId, document.teamId ?? undefined);
      return this.prisma.document.update({
         where: { id: documentId },
         data: { archivedAt: new Date() },
      });
   }

   private async authorize(workspaceId: string, userId: string, teamId?: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this workspace.');
      if (!teamId) return;
      const team = await this.prisma.team.findFirst({
         where: { id: teamId, workspaceId, archivedAt: null, members: { some: { userId } } },
      });
      if (!team) throw new ForbiddenException('You do not have access to this team.');
   }
}
