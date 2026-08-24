import {
   BadRequestException,
   ForbiddenException,
   Injectable,
   NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectCustomFieldType } from '@circle/database';
import { PrismaService } from '../database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProjectCustomFieldDto } from './dto/create-project-custom-field.dto';
import { UpdateProjectCustomFieldDto } from './dto/update-project-custom-field.dto';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { CreateProjectTemplateDto } from './dto/create-project-template.dto';
import { UpdateProjectTemplateDto } from './dto/update-project-template.dto';
import { CreateProjectUpdateDto } from './dto/create-project-update.dto';
import { CreateProjectLabelDto } from './dto/create-project-label.dto';
import { UpdateProjectLabelDto } from './dto/update-project-label.dto';
import { CreateProjectStatusDto } from './dto/create-project-status.dto';
import { UpdateProjectStatusDto } from './dto/update-project-status.dto';
import { CreateProjectResourceDto } from './dto/create-project-resource.dto';
import { NotificationsService } from '../notifications/notifications.service';

const projectInclude = {
   team: true,
   lead: { select: { id: true, name: true, avatarUrl: true } },
   issues: {
      where: { archivedAt: null },
      select: {
         id: true,
         status: { select: { category: true } },
         assignee: { select: { id: true, name: true, avatarUrl: true } },
      },
   },
   _count: { select: { issues: true } },
   initiativeLinks: {
      include: { initiative: { select: { id: true, name: true } } },
   },
   labelLinks: { include: { label: true } },
   resources: {
      include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
   },
   members: {
      include: { user: { select: { id: true, name: true, avatarUrl: true } } },
      orderBy: { createdAt: 'asc' },
   },
} satisfies Prisma.ProjectInclude;

@Injectable()
export class ProjectsService {
   constructor(
      private readonly prisma: PrismaService,
      private readonly notifications: NotificationsService
   ) {}
   async list(workspaceId: string, userId: string, teamId?: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.project.findMany({
         where: { workspaceId, archivedAt: null, ...(teamId ? { teamId } : {}) },
         include: {
            ...projectInclude,
            favorites: { where: { userId }, select: { userId: true } },
         },
         orderBy: { createdAt: 'desc' },
      });
   }
   async create(dto: CreateProjectDto, userId: string) {
      await this.authorize(dto.workspaceId, userId);
      if (dto.teamId) await this.authorizeTeam(dto.workspaceId, dto.teamId, userId);
      const template = dto.templateId
         ? await this.prisma.projectTemplate.findFirst({
              where: { id: dto.templateId, workspaceId: dto.workspaceId },
           })
         : null;
      if (dto.templateId && !template) throw new NotFoundException('Project template not found.');
      const templateConfig =
         template?.config && typeof template.config === 'object' && !Array.isArray(template.config)
            ? (template.config as Record<string, unknown>)
            : {};
      const configString = (key: string) =>
         typeof templateConfig[key] === 'string' ? (templateConfig[key] as string) : undefined;
      const project = await this.prisma.$transaction(async (tx) => {
         const project = await tx.project.create({
            data: {
               workspaceId: dto.workspaceId,
               teamId: dto.teamId,
               name: dto.name,
               identifier: dto.identifier.toUpperCase(),
               description: dto.description ?? configString('description') ?? template?.description,
               type: dto.type ?? template?.type,
               status: configString('status'),
               priority: configString('priority'),
               health: configString('health'),
            },
            include: projectInclude,
         });
         await tx.activity.create({
            data: {
               workspaceId: dto.workspaceId,
               projectId: project.id,
               actorId: userId,
               type: 'project.created',
               data: {
                  name: project.name,
                  identifier: project.identifier,
                  templateId: template?.id,
               },
            },
         });
         return project;
      });
      void this.notifications.notifyWorkspace(
         dto.workspaceId,
         userId,
         'project.created',
         'project',
         project.id,
         { name: project.name, identifier: project.identifier },
         `📁 Project created: ${project.name} (${project.identifier})`
      );
      return project;
   }
   async get(projectId: string, workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      const project = await this.prisma.project.findFirst({
         where: { id: projectId, workspaceId, archivedAt: null },
         include: {
            ...projectInclude,
            favorites: { where: { userId }, select: { userId: true } },
         },
      });
      if (!project) throw new NotFoundException('Project not found.');
      if (project.teamId) await this.authorizeTeam(workspaceId, project.teamId, userId);
      return project;
   }
   async issues(projectId: string, workspaceId: string, userId: string) {
      const project = await this.get(projectId, workspaceId, userId);
      return this.prisma.issue.findMany({
         where: { projectId: project.id, workspaceId, archivedAt: null },
         include: {
            status: { select: { id: true, name: true, category: true, color: true } },
            team: { select: { id: true, name: true, identifier: true } },
            creator: { select: { id: true, name: true, avatarUrl: true } },
            assignee: { select: { id: true, name: true, avatarUrl: true } },
            labelLinks: {
               include: { label: { select: { id: true, name: true, color: true } } },
            },
            cycleLinks: {
               include: { cycle: { select: { id: true, name: true } } },
            },
         },
         orderBy: { updatedAt: 'desc' },
      });
   }
   async updateMembers(
      projectId: string,
      workspaceId: string,
      requestedUserIds: string[],
      userId: string
   ) {
      await this.get(projectId, workspaceId, userId);
      const memberIds = [...new Set(requestedUserIds)];
      const activeMembers = memberIds.length
         ? await this.prisma.workspaceMember.findMany({
              where: { workspaceId, userId: { in: memberIds }, status: 'ACTIVE' },
              select: { userId: true },
           })
         : [];
      if (activeMembers.length !== memberIds.length) {
         throw new BadRequestException('Project members must be active workspace members.');
      }
      return this.prisma.$transaction(async (tx) => {
         await tx.projectMember.deleteMany({ where: { projectId } });
         if (memberIds.length) {
            await tx.projectMember.createMany({
               data: memberIds.map((memberId) => ({ projectId, userId: memberId })),
            });
         }
         await tx.activity.create({
            data: {
               workspaceId,
               projectId,
               actorId: userId,
               type: 'project.members.updated',
               data: { memberIds },
            },
         });
         return tx.projectMember.findMany({
            where: { projectId },
            include: { user: { select: { id: true, name: true, avatarUrl: true } } },
            orderBy: { createdAt: 'asc' },
         });
      });
   }
   async update(projectId: string, workspaceId: string, dto: UpdateProjectDto, userId: string) {
      const project = await this.get(projectId, workspaceId, userId);
      if (project.teamId) await this.authorizeTeam(workspaceId, project.teamId, userId);
      if (dto.leadId) {
         const leadMembership = await this.prisma.workspaceMember.findFirst({
            where: { workspaceId, userId: dto.leadId, status: 'ACTIVE' },
            select: { userId: true },
         });
         if (!leadMembership) {
            throw new NotFoundException('Project lead must be an active workspace member.');
         }
      }
      const { labelIds, ...projectData } = dto;
      if (labelIds) await this.assertProjectLabels(workspaceId, labelIds);
      if (dto.status) await this.assertProjectStatus(workspaceId, dto.status);
      return this.prisma.$transaction(async (tx) => {
         const updated = await tx.project.update({
            where: { id: projectId },
            data: {
               ...projectData,
               ...(labelIds
                  ? {
                       labelLinks: {
                          deleteMany: {},
                          create: [...new Set(labelIds)].map((labelId) => ({ labelId })),
                       },
                    }
                  : {}),
            },
            include: projectInclude,
         });
         await tx.activity.create({
            data: {
               workspaceId,
               projectId,
               actorId: userId,
               type: 'project.updated',
               data: Object.fromEntries(
                  Object.entries(dto).filter(([, value]) => value !== undefined)
               ),
            },
         });
         return updated;
      });
   }
   async archive(projectId: string, workspaceId: string, userId: string) {
      const project = await this.get(projectId, workspaceId, userId);
      if (project.teamId) await this.authorizeTeam(workspaceId, project.teamId, userId);
      return this.prisma.$transaction(async (tx) => {
         const archivedAt = new Date();
         await tx.issue.updateMany({
            where: { projectId, workspaceId, archivedAt: null },
            data: { archivedAt },
         });
         return tx.project.update({
            where: { id: projectId },
            data: { archivedAt },
            include: projectInclude,
         });
      });
   }
   async listUpdates(projectId: string, workspaceId: string, userId: string) {
      await this.get(projectId, workspaceId, userId);
      const updates = await this.prisma.projectUpdate.findMany({
         where: { projectId, workspaceId },
         include: { author: { select: { id: true, name: true, avatarUrl: true } } },
         orderBy: { createdAt: 'desc' },
         take: 25,
      });
      return this.withUpdateAttachments(workspaceId, updates);
   }
   async workspaceUpdates(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      const updates = await this.prisma.projectUpdate.findMany({
         where: { workspaceId, project: { archivedAt: null } },
         include: {
            project: { select: { id: true, name: true, identifier: true } },
            author: { select: { id: true, name: true, avatarUrl: true } },
         },
         orderBy: { createdAt: 'desc' },
         take: 100,
      });
      return this.withUpdateAttachments(workspaceId, updates);
   }
   async createUpdate(projectId: string, dto: CreateProjectUpdateDto, userId: string) {
      const project = await this.get(projectId, dto.workspaceId, userId);
      const body = dto.body.trim();
      if (!body) throw new BadRequestException('Project update cannot be empty.');
      const update = await this.prisma.$transaction(async (tx) => {
         const created = await tx.projectUpdate.create({
            data: {
               workspaceId: dto.workspaceId,
               projectId: project.id,
               authorId: userId,
               body,
               kind: dto.kind ?? 'update',
               health: dto.kind === 'comment' ? null : (dto.health ?? 'on-track'),
            },
            include: { author: { select: { id: true, name: true, avatarUrl: true } } },
         });
         if (dto.kind !== 'comment' && dto.health) {
            await tx.project.update({
               where: { id: project.id },
               data: { health: dto.health },
            });
         }
         await tx.projectSubscription.upsert({
            where: { projectId_userId: { projectId: project.id, userId } },
            create: { projectId: project.id, userId },
            update: {},
         });
         await tx.activity.create({
            data: {
               workspaceId: dto.workspaceId,
               projectId: project.id,
               actorId: userId,
               type: 'project.update.created',
               data: { updateId: created.id, preview: body.slice(0, 200) },
            },
         });
         return created;
      });
      const subscribers = await this.prisma.projectSubscription.findMany({
         where: { projectId: project.id },
         select: { userId: true },
      });
      void this.notifications.notifyUsers(
         subscribers.map((subscriber) => subscriber.userId),
         dto.workspaceId,
         userId,
         'project.update.created',
         'project',
         project.id,
         { name: project.name, updateId: update.id, preview: body.slice(0, 200) },
         `📣 Project update: ${project.name}\n${body.slice(0, 1500)}`
      );
      return { ...update, attachments: [] };
   }
   async createResource(projectId: string, dto: CreateProjectResourceDto, userId: string) {
      const project = await this.get(projectId, dto.workspaceId, userId);
      return this.prisma.$transaction(async (tx) => {
         const resource = await tx.projectResource.create({
            data: {
               workspaceId: dto.workspaceId,
               projectId: project.id,
               createdById: userId,
               label: dto.label.trim(),
               url: dto.url.trim(),
            },
            include: { createdBy: { select: { id: true, name: true, avatarUrl: true } } },
         });
         await tx.activity.create({
            data: {
               workspaceId: dto.workspaceId,
               projectId: project.id,
               actorId: userId,
               type: 'project.resource.created',
               data: { resourceId: resource.id, label: resource.label, url: resource.url },
            },
         });
         return resource;
      });
   }

   async listProjectCustomFields(projectId: string, workspaceId: string, userId: string) {
      await this.get(projectId, workspaceId, userId);
      const fields = await this.prisma.projectCustomField.findMany({
         where: { workspaceId },
         include: { values: { where: { projectId }, select: { value: true } } },
         orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
      });
      return fields.map(({ values, ...field }) => ({
         ...field,
         value: values[0]?.value ?? null,
      }));
   }

   async updateProjectCustomField(
      projectId: string,
      fieldId: string,
      workspaceId: string,
      value: unknown,
      userId: string
   ) {
      await this.get(projectId, workspaceId, userId);
      const field = await this.prisma.projectCustomField.findFirst({
         where: { id: fieldId, workspaceId },
      });
      if (!field) throw new NotFoundException('Project custom field not found.');

      const normalized = this.normalizeCustomFieldValue(field.type, field.options, value);
      if (normalized === null && field.required) {
         throw new BadRequestException(`${field.name} is required.`);
      }

      return this.prisma.$transaction(async (tx) => {
         if (normalized === null) {
            await tx.projectCustomFieldValue.deleteMany({ where: { projectId, fieldId } });
         } else {
            await tx.projectCustomFieldValue.upsert({
               where: { projectId_fieldId: { projectId, fieldId } },
               create: {
                  projectId,
                  fieldId,
                  value: normalized as Prisma.InputJsonValue,
               },
               update: { value: normalized as Prisma.InputJsonValue },
            });
         }
         await tx.activity.create({
            data: {
               workspaceId,
               projectId,
               actorId: userId,
               type: 'project.custom-field.updated',
               data: { fieldId, fieldName: field.name, cleared: normalized === null },
            },
         });
         return { ...field, value: normalized };
      });
   }

   private normalizeCustomFieldValue(
      type: ProjectCustomFieldType,
      options: Prisma.JsonValue,
      value: unknown
   ): Prisma.InputJsonValue | null {
      if (value === null || value === undefined) return null;
      const configuredOptions = Array.isArray(options)
         ? options.filter((option): option is string => typeof option === 'string')
         : [];

      switch (type) {
         case ProjectCustomFieldType.TEXT: {
            if (typeof value !== 'string') throw new BadRequestException('Expected text value.');
            const normalized = value.trim();
            return normalized ? normalized : null;
         }
         case ProjectCustomFieldType.URL: {
            if (typeof value !== 'string') throw new BadRequestException('Expected URL value.');
            const normalized = value.trim();
            if (!normalized) return null;
            try {
               const parsed = new URL(normalized);
               if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
            } catch {
               throw new BadRequestException('Expected a valid HTTP or HTTPS URL.');
            }
            return normalized;
         }
         case ProjectCustomFieldType.NUMBER:
            if (typeof value !== 'number' || !Number.isFinite(value)) {
               throw new BadRequestException('Expected a finite number.');
            }
            return value;
         case ProjectCustomFieldType.DATE: {
            if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
               throw new BadRequestException('Expected a date in YYYY-MM-DD format.');
            }
            const parsed = new Date(`${value}T00:00:00.000Z`);
            if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
               throw new BadRequestException('Expected a valid date.');
            }
            return value;
         }
         case ProjectCustomFieldType.BOOLEAN:
            if (typeof value !== 'boolean')
               throw new BadRequestException('Expected true or false.');
            return value;
         case ProjectCustomFieldType.SELECT:
            if (typeof value !== 'string' || !configuredOptions.includes(value)) {
               throw new BadRequestException('Expected one configured option.');
            }
            return value;
         case ProjectCustomFieldType.MULTI_SELECT: {
            if (
               !Array.isArray(value) ||
               value.some((item) => typeof item !== 'string' || !configuredOptions.includes(item))
            ) {
               throw new BadRequestException('Expected configured options.');
            }
            return [...new Set(value)] as Prisma.InputJsonValue;
         }
      }
   }

   private async withUpdateAttachments<T extends { id: string }>(
      workspaceId: string,
      updates: T[]
   ) {
      if (updates.length === 0) return [];
      const attachments = await this.prisma.attachment.findMany({
         where: {
            workspaceId,
            entityType: 'project-update',
            entityId: { in: updates.map((update) => update.id) },
         },
         select: { id: true, entityId: true, filename: true, mimeType: true, size: true },
         orderBy: { createdAt: 'asc' },
      });
      return updates.map((update) => ({
         ...update,
         attachments: attachments
            .filter((attachment) => attachment.entityId === update.id)
            .map(({ entityId: _entityId, ...attachment }) => attachment),
      }));
   }
   async subscription(projectId: string, workspaceId: string, userId: string) {
      await this.get(projectId, workspaceId, userId);
      const subscription = await this.prisma.projectSubscription.findUnique({
         where: { projectId_userId: { projectId, userId } },
         select: { createdAt: true },
      });
      return { subscribed: Boolean(subscription), subscribedAt: subscription?.createdAt ?? null };
   }
   async subscribe(projectId: string, workspaceId: string, userId: string) {
      await this.get(projectId, workspaceId, userId);
      const subscription = await this.prisma.projectSubscription.upsert({
         where: { projectId_userId: { projectId, userId } },
         create: { projectId, userId },
         update: {},
      });
      return { subscribed: true, subscribedAt: subscription.createdAt };
   }
   async unsubscribe(projectId: string, workspaceId: string, userId: string) {
      await this.get(projectId, workspaceId, userId);
      await this.prisma.projectSubscription.deleteMany({ where: { projectId, userId } });
      return { subscribed: false, subscribedAt: null };
   }
   async favorite(projectId: string, workspaceId: string, userId: string) {
      await this.get(projectId, workspaceId, userId);
      const favorite = await this.prisma.projectFavorite.upsert({
         where: { projectId_userId: { projectId, userId } },
         create: { projectId, userId },
         update: {},
      });
      return { favorite: true, favoritedAt: favorite.createdAt };
   }
   async unfavorite(projectId: string, workspaceId: string, userId: string) {
      await this.get(projectId, workspaceId, userId);
      await this.prisma.projectFavorite.deleteMany({ where: { projectId, userId } });
      return { favorite: false, favoritedAt: null };
   }
   async listCustomFields(workspaceId: string, userId: string): Promise<unknown> {
      await this.authorize(workspaceId, userId);
      return this.prisma.projectCustomField.findMany({
         where: { workspaceId },
         orderBy: [{ position: 'asc' }, { name: 'asc' }],
      });
   }
   async listLabels(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.projectLabel.findMany({
         where: { workspaceId },
         include: { _count: { select: { projectLinks: true } } },
         orderBy: { name: 'asc' },
      });
   }
   async listStatuses(workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      const count = await this.prisma.projectStatus.count({ where: { workspaceId } });
      if (count === 0) {
         await this.prisma.projectStatus.createMany({
            data: [
               { workspaceId, name: 'backlog', category: 'backlog', color: '#95a2b3', position: 0 },
               { workspaceId, name: 'planned', category: 'planned', color: '#95a2b3', position: 0 },
               {
                  workspaceId,
                  name: 'in-progress',
                  category: 'in-progress',
                  color: '#f2c94c',
                  position: 0,
               },
               {
                  workspaceId,
                  name: 'completed',
                  category: 'completed',
                  color: '#5e6ad2',
                  position: 0,
               },
               {
                  workspaceId,
                  name: 'canceled',
                  category: 'canceled',
                  color: '#8f9299',
                  position: 0,
               },
            ],
            skipDuplicates: true,
         });
      }
      const statuses = await this.prisma.projectStatus.findMany({
         where: { workspaceId },
         orderBy: [{ category: 'asc' }, { position: 'asc' }, { name: 'asc' }],
      });
      const projectCounts = await this.prisma.project.groupBy({
         by: ['status'],
         where: { workspaceId, archivedAt: null },
         _count: { _all: true },
      });
      const counts = new Map(projectCounts.map((entry) => [entry.status, entry._count._all]));
      return statuses.map((status) => ({ ...status, projectCount: counts.get(status.name) ?? 0 }));
   }
   async createStatus(dto: CreateProjectStatusDto, userId: string) {
      await this.authorizeManager(dto.workspaceId, userId);
      return this.prisma.projectStatus.create({
         data: { ...dto, name: dto.name.trim().toLowerCase().replace(/\s+/g, '-') },
      });
   }
   async updateStatus(
      statusId: string,
      workspaceId: string,
      dto: UpdateProjectStatusDto,
      userId: string
   ) {
      await this.authorizeManager(workspaceId, userId);
      const status = await this.prisma.projectStatus.findFirst({
         where: { id: statusId, workspaceId },
      });
      if (!status) throw new NotFoundException('Project status not found.');
      const name = dto.name?.trim().toLowerCase().replace(/\s+/g, '-');
      return this.prisma.$transaction(async (tx) => {
         if (name && name !== status.name) {
            await tx.project.updateMany({
               where: { workspaceId, status: status.name },
               data: { status: name },
            });
         }
         return tx.projectStatus.update({
            where: { id: statusId },
            data: { ...dto, ...(name ? { name } : {}) },
         });
      });
   }
   async removeStatus(statusId: string, workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const status = await this.prisma.projectStatus.findFirst({
         where: { id: statusId, workspaceId },
      });
      if (!status) throw new NotFoundException('Project status not found.');
      const inUse = await this.prisma.project.count({
         where: { workspaceId, status: status.name, archivedAt: null },
      });
      if (inUse > 0)
         throw new BadRequestException('Move projects to another status before deleting it.');
      await this.prisma.projectStatus.delete({ where: { id: statusId } });
      return { id: statusId, deleted: true };
   }
   async createLabel(dto: CreateProjectLabelDto, userId: string) {
      await this.authorize(dto.workspaceId, userId);
      return this.prisma.projectLabel.create({
         data: { ...dto, name: dto.name.trim() },
         include: { _count: { select: { projectLinks: true } } },
      });
   }
   async updateLabel(
      labelId: string,
      workspaceId: string,
      dto: UpdateProjectLabelDto,
      userId: string
   ) {
      await this.authorizeManager(workspaceId, userId);
      const label = await this.prisma.projectLabel.findFirst({
         where: { id: labelId, workspaceId },
      });
      if (!label) throw new NotFoundException('Project label not found.');
      return this.prisma.projectLabel.update({
         where: { id: labelId },
         data: { ...dto, ...(dto.name ? { name: dto.name.trim() } : {}) },
         include: { _count: { select: { projectLinks: true } } },
      });
   }
   async removeLabel(labelId: string, workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const label = await this.prisma.projectLabel.findFirst({
         where: { id: labelId, workspaceId },
      });
      if (!label) throw new NotFoundException('Project label not found.');
      await this.prisma.projectLabel.delete({ where: { id: labelId } });
      return { id: labelId, deleted: true };
   }
   async createCustomField(dto: CreateProjectCustomFieldDto, userId: string): Promise<unknown> {
      await this.authorizeManager(dto.workspaceId, userId);
      const options = this.normalizeCustomFieldOptions(dto.type, dto.options);
      return this.prisma.projectCustomField.create({
         data: {
            ...dto,
            name: dto.name.trim(),
            options,
         },
      });
   }
   async updateCustomField(
      fieldId: string,
      workspaceId: string,
      dto: UpdateProjectCustomFieldDto,
      userId: string
   ): Promise<unknown> {
      await this.authorizeManager(workspaceId, userId);
      const field = await this.prisma.projectCustomField.findFirst({
         where: { id: fieldId, workspaceId },
      });
      if (!field) throw new NotFoundException('Project custom field not found.');
      const type = dto.type ?? field.type;
      const existingOptions = Array.isArray(field.options)
         ? field.options.filter((option): option is string => typeof option === 'string')
         : undefined;
      const options = this.normalizeCustomFieldOptions(type, dto.options ?? existingOptions);
      return this.prisma.$transaction(async (tx) => {
         if (dto.type && dto.type !== field.type) {
            await tx.projectCustomFieldValue.deleteMany({ where: { fieldId } });
         }
         return tx.projectCustomField.update({
            where: { id: fieldId },
            data: {
               ...dto,
               ...(dto.name ? { name: dto.name.trim() } : {}),
               options,
            },
         });
      });
   }
   async removeCustomField(fieldId: string, workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const field = await this.prisma.projectCustomField.findFirst({
         where: { id: fieldId, workspaceId },
      });
      if (!field) throw new NotFoundException('Project custom field not found.');
      await this.prisma.projectCustomField.delete({ where: { id: fieldId } });
      return { id: fieldId, deleted: true };
   }

   private normalizeCustomFieldOptions(
      type: ProjectCustomFieldType,
      options: string[] | undefined
   ): Prisma.InputJsonValue | typeof Prisma.JsonNull {
      if (type !== ProjectCustomFieldType.SELECT && type !== ProjectCustomFieldType.MULTI_SELECT) {
         return Prisma.JsonNull;
      }
      const normalized = [
         ...new Set((options ?? []).map((option) => option.trim()).filter(Boolean)),
      ];
      if (normalized.length === 0) {
         throw new BadRequestException('Select fields require at least one option.');
      }
      return normalized;
   }
   async listMilestones(projectId: string, workspaceId: string, userId: string) {
      await this.get(projectId, workspaceId, userId);
      return this.prisma.projectMilestone.findMany({
         where: { projectId, workspaceId },
         orderBy: [{ position: 'asc' }, { targetDate: 'asc' }],
      });
   }
   async createMilestone(projectId: string, dto: CreateMilestoneDto, userId: string) {
      await this.get(projectId, dto.workspaceId, userId);
      return this.prisma.projectMilestone.create({
         data: {
            projectId,
            workspaceId: dto.workspaceId,
            title: dto.title.trim(),
            description: dto.description,
            targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
            position: dto.position,
         },
      });
   }
   async updateMilestone(
      milestoneId: string,
      projectId: string,
      workspaceId: string,
      dto: UpdateMilestoneDto,
      userId: string
   ) {
      await this.get(projectId, workspaceId, userId);
      const milestone = await this.prisma.projectMilestone.findFirst({
         where: { id: milestoneId, projectId, workspaceId },
      });
      if (!milestone) throw new NotFoundException('Project milestone not found.');
      const { completed, targetDate, ...data } = dto;
      return this.prisma.projectMilestone.update({
         where: { id: milestoneId },
         data: {
            ...data,
            targetDate: targetDate ? new Date(targetDate) : undefined,
            ...(completed === undefined ? {} : { completedAt: completed ? new Date() : null }),
         },
      });
   }
   async removeMilestone(
      milestoneId: string,
      projectId: string,
      workspaceId: string,
      userId: string
   ) {
      await this.get(projectId, workspaceId, userId);
      const milestone = await this.prisma.projectMilestone.findFirst({
         where: { id: milestoneId, projectId, workspaceId },
      });
      if (!milestone) throw new NotFoundException('Project milestone not found.');
      await this.prisma.projectMilestone.delete({ where: { id: milestoneId } });
      return { id: milestoneId, deleted: true };
   }
   async listTemplates(workspaceId: string, userId: string): Promise<unknown> {
      await this.authorize(workspaceId, userId);
      return this.prisma.projectTemplate.findMany({
         where: { workspaceId },
         orderBy: { name: 'asc' },
      });
   }
   async createTemplate(dto: CreateProjectTemplateDto, userId: string): Promise<unknown> {
      await this.authorizeManager(dto.workspaceId, userId);
      return this.prisma.projectTemplate.create({
         data: {
            ...dto,
            name: dto.name.trim(),
            config: (dto.config ?? {}) as Prisma.InputJsonValue,
         },
      });
   }
   async updateTemplate(
      templateId: string,
      workspaceId: string,
      dto: UpdateProjectTemplateDto,
      userId: string
   ): Promise<unknown> {
      await this.authorizeManager(workspaceId, userId);
      const template = await this.prisma.projectTemplate.findFirst({
         where: { id: templateId, workspaceId },
      });
      if (!template) throw new NotFoundException('Project template not found.');
      const { config, ...data } = dto;
      return this.prisma.projectTemplate.update({
         where: { id: templateId },
         data: {
            ...data,
            ...(dto.name ? { name: dto.name.trim() } : {}),
            ...(config ? { config: config as Prisma.InputJsonValue } : {}),
         },
      });
   }
   async removeTemplate(templateId: string, workspaceId: string, userId: string) {
      await this.authorizeManager(workspaceId, userId);
      const template = await this.prisma.projectTemplate.findFirst({
         where: { id: templateId, workspaceId },
      });
      if (!template) throw new NotFoundException('Project template not found.');
      await this.prisma.projectTemplate.delete({ where: { id: templateId } });
      return { id: templateId, deleted: true };
   }
   private async authorize(workspaceId: string, userId: string) {
      if (
         !(await this.prisma.workspaceMember.findFirst({
            where: { workspaceId, userId, status: 'ACTIVE' },
         }))
      )
         throw new ForbiddenException('You do not have access to this workspace.');
   }
   private async authorizeManager(workspaceId: string, userId: string) {
      if (
         !(await this.prisma.workspaceMember.findFirst({
            where: { workspaceId, userId, status: 'ACTIVE', role: { in: ['OWNER', 'ADMIN'] } },
         }))
      ) {
         throw new ForbiddenException('Workspace administrator access is required.');
      }
   }
   private async assertProjectLabels(workspaceId: string, labelIds: string[]) {
      const uniqueLabelIds = [...new Set(labelIds)];
      const count = await this.prisma.projectLabel.count({
         where: { workspaceId, id: { in: uniqueLabelIds } },
      });
      if (count !== uniqueLabelIds.length) {
         throw new NotFoundException(
            'One or more project labels are not available in this workspace.'
         );
      }
   }
   private async assertProjectStatus(workspaceId: string, status: string) {
      const configured = await this.prisma.projectStatus.findFirst({
         where: { workspaceId, name: status },
         select: { id: true },
      });
      if (!configured)
         throw new NotFoundException('Project status is not configured in this workspace.');
   }
   private async authorizeTeam(workspaceId: string, teamId: string, userId: string) {
      const team = await this.prisma.team.findFirst({
         where: { id: teamId, workspaceId, archivedAt: null, members: { some: { userId } } },
      });
      if (!team) throw new ForbiddenException('You do not have access to this team.');
   }
}
