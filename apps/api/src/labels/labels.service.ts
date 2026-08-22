import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

@Injectable()
export class LabelsService {
   constructor(private readonly prisma: PrismaService) {}

   async list(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.label.findMany({
         where: { workspaceId },
         include: { _count: { select: { issueLinks: true } } },
         orderBy: { name: 'asc' },
      });
   }

   async create(dto: CreateLabelDto, userId: string) {
      await this.authorize(dto.workspaceId, userId);
      return this.prisma.label.create({
         data: { ...dto, name: dto.name.trim() },
         include: { _count: { select: { issueLinks: true } } },
      });
   }

   async update(labelId: string, workspaceId: string, dto: UpdateLabelDto, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const label = await this.prisma.label.findFirst({ where: { id: labelId, workspaceId } });
      if (!label) throw new NotFoundException('Label not found.');
      return this.prisma.label.update({
         where: { id: labelId },
         data: { ...dto, ...(dto.name ? { name: dto.name.trim() } : {}) },
         include: { _count: { select: { issueLinks: true } } },
      });
   }

   async remove(labelId: string, workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const label = await this.prisma.label.findFirst({ where: { id: labelId, workspaceId } });
      if (!label) throw new NotFoundException('Label not found.');
      await this.prisma.label.delete({ where: { id: labelId } });
      return { id: labelId, deleted: true };
   }

   private async authorize(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      if (!membership) throw new ForbiddenException('You do not have access to this workspace.');
   }

   private async authorizeManager(workspaceId: string, userId: string) {
      const membership = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
      });
      if (!membership) throw new ForbiddenException('Workspace administrator access is required.');
   }
}
