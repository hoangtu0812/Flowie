import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@circle/database';
import { PrismaService } from '../database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { CreateProjectCustomFieldDto } from './dto/create-project-custom-field.dto';
import { UpdateProjectCustomFieldDto } from './dto/update-project-custom-field.dto';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
import { CreateProjectTemplateDto } from './dto/create-project-template.dto';
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
         include: projectInclude,
         orderBy: { createdAt: 'desc' },
      });
   }
   async create(dto: CreateProjectDto, userId: string) {
      await this.authorize(dto.workspaceId, userId);
      if (dto.teamId) await this.authorizeTeam(dto.workspaceId, dto.teamId, userId);
      const project = await this.prisma.$transaction(async (tx) => {
         const project = await tx.project.create({
            data: { ...dto, identifier: dto.identifier.toUpperCase() },
            include: projectInclude,
         });
         await tx.activity.create({
            data: {
               workspaceId: dto.workspaceId,
               projectId: project.id,
               actorId: userId,
               type: 'project.created',
               data: { name: project.name, identifier: project.identifier },
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
         include: projectInclude,
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
            assignee: { select: { id: true, name: true, avatarUrl: true } },
         },
         orderBy: { updatedAt: 'desc' },
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
      return this.prisma.$transaction(async (tx) => {
         const updated = await tx.project.update({
            where: { id: projectId },
            data: dto,
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
   async listCustomFields(workspaceId: string, userId: string): Promise<unknown> {
      await this.authorize(workspaceId, userId);
      return this.prisma.projectCustomField.findMany({
         where: { workspaceId },
         orderBy: [{ position: 'asc' }, { name: 'asc' }],
      });
   }
   async createCustomField(dto: CreateProjectCustomFieldDto, userId: string): Promise<unknown> {
      await this.authorizeManager(dto.workspaceId, userId);
      return this.prisma.projectCustomField.create({
         data: {
            ...dto,
            name: dto.name.trim(),
            options: dto.options as Prisma.InputJsonValue | undefined,
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
      return this.prisma.projectCustomField.update({
         where: { id: fieldId },
         data: {
            ...dto,
            ...(dto.name ? { name: dto.name.trim() } : {}),
            options: dto.options as Prisma.InputJsonValue | undefined,
         },
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
   private async authorizeTeam(workspaceId: string, teamId: string, userId: string) {
      const team = await this.prisma.team.findFirst({
         where: { id: teamId, workspaceId, archivedAt: null, members: { some: { userId } } },
      });
      if (!team) throw new ForbiddenException('You do not have access to this team.');
   }
}
