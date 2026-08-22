import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@circle/database';
import { PrismaService } from '../database/prisma.service';
import { CreateSavedViewDto } from './dto/create-saved-view.dto';
import { CreateInitiativeDto } from './dto/create-initiative.dto';
import { UpdateInitiativeDto } from './dto/update-initiative.dto';

@Injectable()
export class PortfolioService {
   constructor(private readonly prisma: PrismaService) {}

   async savedViews(workspaceId: string, userId: string): Promise<unknown> {
      await this.authorize(workspaceId, userId);
      return this.prisma.savedView.findMany({
         where: { workspaceId, OR: [{ isShared: true }, { createdById: userId }] },
         include: { createdBy: { select: { id: true, name: true } } },
         orderBy: [{ isShared: 'desc' }, { updatedAt: 'desc' }],
      });
   }

   async createSavedView(dto: CreateSavedViewDto, userId: string): Promise<unknown> {
      await this.authorize(dto.workspaceId, userId);
      return this.prisma.savedView.create({
         data: {
            workspaceId: dto.workspaceId,
            createdById: userId,
            name: dto.name.trim(),
            entityType: dto.entityType,
            filters: (dto.filters ?? {}) as Prisma.InputJsonValue,
            isShared: dto.isShared ?? false,
         },
         include: { createdBy: { select: { id: true, name: true } } },
      });
   }

   async removeSavedView(viewId: string, workspaceId: string, userId: string) {
      const view = await this.prisma.savedView.findFirst({ where: { id: viewId, workspaceId } });
      if (!view) throw new NotFoundException('Saved view not found.');
      if (view.createdById !== userId)
         throw new ForbiddenException('Only the creator can delete this view.');
      await this.prisma.savedView.delete({ where: { id: viewId } });
      return { id: viewId, deleted: true };
   }

   async initiatives(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.initiative.findMany({
         where: { workspaceId, archivedAt: null },
         include: {
            projectLinks: {
               include: {
                  project: {
                     select: { id: true, name: true, identifier: true, status: true, health: true },
                  },
               },
            },
            _count: { select: { projectLinks: true } },
         },
         orderBy: { updatedAt: 'desc' },
      });
   }

   async createInitiative(dto: CreateInitiativeDto, userId: string) {
      await this.authorizeManager(dto.workspaceId, userId);
      return this.prisma.initiative.create({
         data: {
            workspaceId: dto.workspaceId,
            name: dto.name.trim(),
            description: dto.description,
            status: dto.status ?? 'planned',
            targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
         },
         include: {
            projectLinks: { include: { project: true } },
            _count: { select: { projectLinks: true } },
         },
      });
   }

   async updateInitiative(
      initiativeId: string,
      workspaceId: string,
      dto: UpdateInitiativeDto,
      userId: string
   ) {
      await this.authorizeManager(workspaceId, userId);
      const initiative = await this.prisma.initiative.findFirst({
         where: { id: initiativeId, workspaceId, archivedAt: null },
      });
      if (!initiative) throw new NotFoundException('Initiative not found.');
      return this.prisma.initiative.update({
         where: { id: initiativeId },
         data: { ...dto, targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined },
      });
   }

   async archiveInitiative(initiativeId: string, workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const initiative = await this.prisma.initiative.findFirst({
         where: { id: initiativeId, workspaceId, archivedAt: null },
      });
      if (!initiative) throw new NotFoundException('Initiative not found.');
      return this.prisma.initiative.update({
         where: { id: initiativeId },
         data: { archivedAt: new Date() },
      });
   }

   async linkProject(initiativeId: string, workspaceId: string, projectId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const [initiative, project] = await Promise.all([
         this.prisma.initiative.findFirst({
            where: { id: initiativeId, workspaceId, archivedAt: null },
         }),
         this.prisma.project.findFirst({ where: { id: projectId, workspaceId, archivedAt: null } }),
      ]);
      if (!initiative || !project) throw new NotFoundException('Initiative or project not found.');
      return this.prisma.initiativeProject.upsert({
         where: { initiativeId_projectId: { initiativeId, projectId } },
         create: { initiativeId, projectId },
         update: {},
      });
   }

   async unlinkProject(
      initiativeId: string,
      workspaceId: string,
      projectId: string,
      userId: string
   ) {
      await this.authorizeManager(workspaceId, userId);
      const initiative = await this.prisma.initiative.findFirst({
         where: { id: initiativeId, workspaceId },
      });
      if (!initiative) throw new NotFoundException('Initiative not found.');
      await this.prisma.initiativeProject.delete({
         where: { initiativeId_projectId: { initiativeId, projectId } },
      });
      return { initiativeId, projectId, removed: true };
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
