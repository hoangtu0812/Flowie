import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateLabelGroupDto } from './dto/create-label-group.dto';
import { CreateLabelDto } from './dto/create-label.dto';
import { UpdateLabelGroupDto } from './dto/update-label-group.dto';
import { UpdateLabelDto } from './dto/update-label.dto';

@Injectable()
export class LabelsService {
   constructor(private readonly prisma: PrismaService) {}

   async list(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.label.findMany({
         where: { workspaceId },
         include: { group: true, _count: { select: { issueLinks: true } } },
         orderBy: { name: 'asc' },
      });
   }

   async create(dto: CreateLabelDto, userId: string) {
      await this.authorize(dto.workspaceId, userId);
      await this.validateGroup(dto.workspaceId, dto.groupId);
      return this.prisma.label.create({
         data: { ...dto, name: dto.name.trim() },
         include: { group: true, _count: { select: { issueLinks: true } } },
      });
   }

   async update(labelId: string, workspaceId: string, dto: UpdateLabelDto, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const label = await this.prisma.label.findFirst({ where: { id: labelId, workspaceId } });
      if (!label) throw new NotFoundException('Label not found.');
      await this.validateGroup(workspaceId, dto.groupId);
      return this.prisma.label.update({
         where: { id: labelId },
         data: { ...dto, ...(dto.name ? { name: dto.name.trim() } : {}) },
         include: { group: true, _count: { select: { issueLinks: true } } },
      });
   }

   async remove(labelId: string, workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const label = await this.prisma.label.findFirst({ where: { id: labelId, workspaceId } });
      if (!label) throw new NotFoundException('Label not found.');
      await this.prisma.label.delete({ where: { id: labelId } });
      return { id: labelId, deleted: true };
   }

   async listGroups(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.labelGroup.findMany({
         where: { workspaceId },
         include: { _count: { select: { labels: true } } },
         orderBy: { name: 'asc' },
      });
   }

   async createGroup(dto: CreateLabelGroupDto, userId: string) {
      await this.authorizeManager(dto.workspaceId, userId);
      return this.prisma.labelGroup.create({
         data: {
            workspaceId: dto.workspaceId,
            name: dto.name.trim(),
            description: dto.description?.trim() || null,
         },
         include: { _count: { select: { labels: true } } },
      });
   }

   async updateGroup(
      groupId: string,
      workspaceId: string,
      dto: UpdateLabelGroupDto,
      userId: string
   ) {
      await this.authorizeManager(workspaceId, userId);
      await this.findGroup(groupId, workspaceId);
      return this.prisma.labelGroup.update({
         where: { id: groupId },
         data: {
            ...dto,
            ...(dto.name ? { name: dto.name.trim() } : {}),
            ...(dto.description !== undefined
               ? { description: dto.description?.trim() || null }
               : {}),
         },
         include: { _count: { select: { labels: true } } },
      });
   }

   async removeGroup(groupId: string, workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      await this.findGroup(groupId, workspaceId);
      await this.prisma.labelGroup.delete({ where: { id: groupId } });
      return { id: groupId, deleted: true };
   }

   private async validateGroup(workspaceId: string, groupId?: string | null) {
      if (!groupId) return;
      await this.findGroup(groupId, workspaceId);
   }

   private async findGroup(groupId: string, workspaceId: string) {
      const group = await this.prisma.labelGroup.findFirst({ where: { id: groupId, workspaceId } });
      if (!group) throw new NotFoundException('Label group not found.');
      return group;
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
