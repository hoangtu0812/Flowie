import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { IntegrationsService } from '../integrations/integrations.service';
@Injectable()
export class ProjectsService {
   constructor(private readonly prisma: PrismaService, private readonly integrations: IntegrationsService) {}
   async list(workspaceId: string, userId: string, teamId?: string) {
      await this.authorize(workspaceId, userId);
      return this.prisma.project.findMany({
         where: { workspaceId, archivedAt: null, ...(teamId ? { teamId } : {}) },
         include: { team: true, _count: { select: { issues: true } } },
         orderBy: { createdAt: 'desc' },
      });
   }
   async create(dto: CreateProjectDto, userId: string) {
      await this.authorize(dto.workspaceId, userId);
      if (dto.teamId) await this.authorizeTeam(dto.workspaceId, dto.teamId, userId);
      const project = await this.prisma.$transaction(async (tx) => {
         const project = await tx.project.create({
            data: { ...dto, identifier: dto.identifier.toUpperCase() },
            include: { team: true, _count: { select: { issues: true } } },
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
      void this.integrations.publish(dto.workspaceId, `📁 Project created: ${project.name} (${project.identifier})`);
      return project;
   }
   async get(projectId: string, workspaceId: string, userId: string) {
      await this.authorize(workspaceId, userId);
      const project = await this.prisma.project.findFirst({
         where: { id: projectId, workspaceId, archivedAt: null },
         include: { team: true, _count: { select: { issues: true } } },
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
   private async authorize(workspaceId: string, userId: string) {
      if (
         !(await this.prisma.workspaceMember.findFirst({
            where: { workspaceId, userId, status: 'ACTIVE' },
         }))
      )
         throw new ForbiddenException('You do not have access to this workspace.');
   }
   private async authorizeTeam(workspaceId: string, teamId: string, userId: string) {
      const team = await this.prisma.team.findFirst({
         where: { id: teamId, workspaceId, members: { some: { userId } } },
      });
      if (!team) throw new ForbiddenException('You do not have access to this team.');
   }
}
