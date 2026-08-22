import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';

const documentInclude = {
   createdBy: { select: { id: true, name: true, avatarUrl: true } },
   updatedBy: { select: { id: true, name: true, avatarUrl: true } },
   team: { select: { id: true, name: true, identifier: true } },
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

   async create(dto: CreateDocumentDto, userId: string) {
      await this.authorize(dto.workspaceId, userId, dto.teamId);
      return this.prisma.document.create({
         data: { ...dto, createdById: userId, updatedById: userId },
         include: documentInclude,
      });
   }

   async update(documentId: string, workspaceId: string, dto: UpdateDocumentDto, userId: string) {
      const document = await this.prisma.document.findFirst({
         where: { id: documentId, workspaceId, archivedAt: null },
      });
      if (!document) throw new NotFoundException('Document not found.');
      await this.authorize(workspaceId, userId, document.teamId ?? undefined);
      return this.prisma.document.update({
         where: { id: documentId },
         data: { ...dto, updatedById: userId },
         include: documentInclude,
      });
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
