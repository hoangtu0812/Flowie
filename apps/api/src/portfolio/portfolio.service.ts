import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@circle/database';
import { PrismaService } from '../database/prisma.service';
import { CreateSavedViewDto } from './dto/create-saved-view.dto';
import { CreateInitiativeDto } from './dto/create-initiative.dto';
import { UpdateInitiativeDto } from './dto/update-initiative.dto';
import { AuditService } from '../audit/audit.service';
import { CreateInitiativeUpdateDto } from './dto/create-initiative-update.dto';
import { CreateInitiativeResourceDto } from './dto/create-initiative-resource.dto';

const initiativeInclude = {
   owner: { select: { id: true, name: true, avatarUrl: true } },
   projectLinks: {
      include: {
         project: {
            select: {
               id: true,
               name: true,
               identifier: true,
               status: true,
               priority: true,
               health: true,
               createdAt: true,
               startDate: true,
               targetDate: true,
               team: { select: { id: true, name: true, identifier: true, icon: true } },
               lead: { select: { id: true, name: true, avatarUrl: true } },
               issues: {
                  where: { archivedAt: null },
                  select: { id: true, status: { select: { category: true } } },
               },
            },
         },
      },
   },
   updates: {
      include: { author: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
   },
   resources: {
      include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
   },
   _count: { select: { projectLinks: true } },
} as const;

@Injectable()
export class PortfolioService {
   constructor(
      private readonly prisma: PrismaService,
      private readonly audit: AuditService
   ) {}

   async savedViews(workspaceId: string, userId: string): Promise<unknown> {
      await this.authorize(workspaceId, userId);
      return this.prisma.savedView.findMany({
         where: { workspaceId, OR: [{ isShared: true }, { createdById: userId }] },
         include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
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
            description: dto.description?.trim() || null,
            entityType: dto.entityType,
            filters: (dto.filters ?? {}) as Prisma.InputJsonValue,
            isShared: dto.isShared ?? false,
         },
         include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
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
         include: initiativeInclude,
         orderBy: { updatedAt: 'desc' },
      });
   }

   async createInitiative(dto: CreateInitiativeDto, userId: string) {
      await this.authorizeManager(dto.workspaceId, userId);
      const ownerId = dto.ownerId ?? userId;
      await this.assertWorkspaceOwner(dto.workspaceId, ownerId);
      const initiative = await this.prisma.initiative.create({
         data: {
            workspaceId: dto.workspaceId,
            name: dto.name.trim(),
            description: dto.description,
            status: dto.status ?? 'planned',
            priority: dto.priority ?? 'none',
            health: dto.health ?? 'no-update',
            icon: dto.icon,
            ownerId,
            targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
         },
         include: initiativeInclude,
      });
      await this.audit.record({
         workspaceId: dto.workspaceId,
         actorId: userId,
         action: 'initiative.created',
         entityType: 'initiative',
         entityId: initiative.id,
         metadata: { name: initiative.name },
      });
      return initiative;
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
      if (dto.ownerId) await this.assertWorkspaceOwner(workspaceId, dto.ownerId);
      const updated = await this.prisma.initiative.update({
         where: { id: initiativeId },
         data: {
            ...dto,
            ...(dto.targetDate !== undefined
               ? { targetDate: dto.targetDate ? new Date(dto.targetDate) : null }
               : {}),
         },
         include: initiativeInclude,
      });
      await this.audit.record({
         workspaceId,
         actorId: userId,
         action: 'initiative.updated',
         entityType: 'initiative',
         entityId: initiativeId,
         metadata: Object.fromEntries(
            Object.entries(dto).filter(([, value]) => value !== undefined)
         ),
      });
      return updated;
   }

   async archiveInitiative(initiativeId: string, workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const initiative = await this.prisma.initiative.findFirst({
         where: { id: initiativeId, workspaceId, archivedAt: null },
      });
      if (!initiative) throw new NotFoundException('Initiative not found.');
      const archived = await this.prisma.initiative.update({
         where: { id: initiativeId },
         data: { archivedAt: new Date() },
      });
      await this.audit.record({
         workspaceId,
         actorId: userId,
         action: 'initiative.archived',
         entityType: 'initiative',
         entityId: initiativeId,
      });
      return archived;
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
      const link = await this.prisma.initiativeProject.upsert({
         where: { initiativeId_projectId: { initiativeId, projectId } },
         create: { initiativeId, projectId },
         update: {},
      });
      await this.audit.record({
         workspaceId,
         actorId: userId,
         action: 'initiative.project.linked',
         entityType: 'initiative',
         entityId: initiativeId,
         metadata: { projectId, projectName: project.name },
      });
      return link;
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
      await this.audit.record({
         workspaceId,
         actorId: userId,
         action: 'initiative.project.unlinked',
         entityType: 'initiative',
         entityId: initiativeId,
         metadata: { projectId },
      });
      return { initiativeId, projectId, removed: true };
   }

   async initiativeActivity(initiativeId: string, workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      const initiative = await this.prisma.initiative.findFirst({
         where: { id: initiativeId, workspaceId },
         select: { id: true },
      });
      if (!initiative) throw new NotFoundException('Initiative not found.');
      const logs = await this.prisma.auditLog.findMany({
         where: { workspaceId, entityType: 'initiative', entityId: initiativeId },
         orderBy: { createdAt: 'desc' },
         take: 100,
      });
      const actorIds = [...new Set(logs.flatMap((log) => (log.actorId ? [log.actorId] : [])))];
      const actors = await this.prisma.user.findMany({
         where: { id: { in: actorIds } },
         select: { id: true, name: true, avatarUrl: true },
      });
      const actorById = new Map(actors.map((actor) => [actor.id, actor]));
      return logs.map((log) => ({
         id: log.id,
         action: log.action,
         metadata: log.metadata,
         createdAt: log.createdAt,
         actor: log.actorId ? (actorById.get(log.actorId) ?? null) : null,
      }));
   }

   async createInitiativeUpdate(
      initiativeId: string,
      dto: CreateInitiativeUpdateDto,
      userId: string
   ) {
      await this.authorizeManager(dto.workspaceId, userId);
      const initiative = await this.prisma.initiative.findFirst({
         where: { id: initiativeId, workspaceId: dto.workspaceId, archivedAt: null },
      });
      if (!initiative) throw new NotFoundException('Initiative not found.');
      const health = dto.health ?? initiative.health;
      const update = await this.prisma.$transaction(async (tx) => {
         if (dto.health) {
            await tx.initiative.update({
               where: { id: initiativeId },
               data: { health },
            });
         }
         return tx.initiativeUpdate.create({
            data: {
               workspaceId: dto.workspaceId,
               initiativeId,
               authorId: userId,
               body: dto.body.trim(),
               health,
            },
            include: { author: { select: { id: true, name: true, avatarUrl: true } } },
         });
      });
      await this.audit.record({
         workspaceId: dto.workspaceId,
         actorId: userId,
         action: 'initiative.update.posted',
         entityType: 'initiative',
         entityId: initiativeId,
         metadata: { body: update.body, health: update.health, updateId: update.id },
      });
      return update;
   }

   async addInitiativeResource(
      initiativeId: string,
      dto: CreateInitiativeResourceDto,
      userId: string
   ) {
      await this.authorizeManager(dto.workspaceId, userId);
      const initiative = await this.prisma.initiative.findFirst({
         where: { id: initiativeId, workspaceId: dto.workspaceId, archivedAt: null },
         select: { id: true },
      });
      if (!initiative) throw new NotFoundException('Initiative not found.');
      const resource = await this.prisma.initiativeResource.create({
         data: {
            workspaceId: dto.workspaceId,
            initiativeId,
            createdById: userId,
            label: dto.label.trim(),
            url: dto.url.trim(),
         },
         include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
      });
      await this.audit.record({
         workspaceId: dto.workspaceId,
         actorId: userId,
         action: 'initiative.resource.added',
         entityType: 'initiative',
         entityId: initiativeId,
         metadata: { label: resource.label, url: resource.url, resourceId: resource.id },
      });
      return resource;
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

   private async assertWorkspaceOwner(workspaceId: string, userId: string) {
      const member = await this.prisma.workspaceMember.findFirst({
         where: { workspaceId, userId, status: 'ACTIVE' },
      });
      if (!member)
         throw new NotFoundException('Initiative owner must be an active workspace member.');
   }
}
